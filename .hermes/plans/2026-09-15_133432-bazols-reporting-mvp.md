# Bazols Reporting MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Follow `repo-feature-delivery-workflow`, strict RED → GREEN → REFACTOR, and request user approval before any commit, push, deployment, or external write.

**Goal:** Build a locally runnable Bazols web application that manually imports permitted source API data, stores encrypted raw snapshots plus normalized records, and shows restaurant-scoped employee and product rankings.

**Architecture:** An npm-workspaces monorepo contains a NestJS HTTP API, a separate polling worker process sharing the API domain modules, a React/Vite web app, and shared HTTP contracts. PostgreSQL is both the data store and the small MVP job queue; no Redis or scheduler is introduced. The source adapter owns the undocumented API boundary and fails closed when its schema changes.

**Tech Stack:** Node.js 22+, TypeScript, npm workspaces, NestJS, PostgreSQL, Prisma, Zod, Argon2id, React, Vite, MUI Core, MUI X Community, TanStack Query, Recharts, Vitest, Supertest, Testing Library, Playwright.

**Authoritative spec:** `docs/specs/bazols-reporting-mvp.md`

---

## 1. Delivery constraints

- Do not commit or push until the user explicitly asks.
- Never put real source responses, names, phone numbers, emails, credentials, cookies, or tokens in Git fixtures or test snapshots.
- Source integration remains GET-only and limited to the four spec endpoints.
- Use the real source only for an explicitly approved read-only smoke check. All automated tests use a local fake source.
- Production/deployment work is outside this plan.
- Implement one vertical slice at a time. For every behavior: create the focused test, observe the intended failure, add the smallest implementation, observe the pass, then run the relevant suite.

## 2. Target repository structure

```text
package.json
package-lock.json
tsconfig.base.json
eslint.config.js
.prettierrc.json
compose.yaml
.env.example
apps/
  api/
    package.json
    tsconfig.json
    src/
      main.ts
      worker.ts
      app.module.ts
      config/
      db/
      auth/
      users/
      restaurants/
      source/
      sync/
      reports/
      audit/
    test/
  web/
    package.json
    vite.config.ts
    src/
      main.tsx
      app/
      auth/
      reports/
      admin/
      theme/
      test/
    e2e/
packages/
  contracts/
    package.json
    src/
prisma/
  schema.prisma
  migrations/
test/
  fixtures/source/
  fake-source/
  privacy/
docs/
  specs/
```

## 3. Canonical commands after implementation

```bash
npm ci
npm run db:up
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run dev
npm run test:e2e
```

`README.md` and the Commands block in `AGENTS.md` must contain the exact commands that are proven to work at the end.

---

## Phase A — foundation

### Task 1: Create the npm workspace and quality gates

**Objective:** Establish one reproducible toolchain without application behavior.

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Modify: `.gitignore`

**Steps:**

1. Add npm workspaces for `apps/*` and `packages/*` and root scripts for lint, typecheck, test, integration test, build and development.
2. Install only the dependencies named in this plan and generate `package-lock.json`; inspect licenses before retaining a new dependency.
3. Add an intentionally failing root smoke test that imports `@bazols/contracts` before that package exports anything.
4. Run `npm test`; verify RED is a missing export, not a toolchain/configuration error.
5. Export a minimal `healthResponseSchema` from `packages/contracts/src/index.ts`.
6. Re-run `npm test`; expect PASS.
7. Run `npm run lint && npm run typecheck`; expect clean output.

**Dependency boundary:** MUI X Pro/Premium and Tailwind must not appear in `package-lock.json`.

### Task 2: Add local PostgreSQL and validated environment configuration

**Objective:** Make local setup deterministic while keeping secrets outside Git.

**Files:**
- Create: `compose.yaml`
- Create: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/config/env.schema.spec.ts`
- Modify: `.env.example`

**RED test cases:**

- missing `DATABASE_URL` fails startup validation;
- malformed `RAW_DATA_ENCRYPTION_KEY` fails;
- placeholder source password is rejected outside test mode;
- valid test configuration is parsed without returning secret values in errors.

**Implementation contract:**

```ts
export type AppEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  SESSION_SECRET: string;
  RAW_DATA_ENCRYPTION_KEY: string; // base64, exactly 32 decoded bytes
  SOURCE_SITE_URL: string;         // https outside test
  SOURCE_SITE_LOGIN: string;
  SOURCE_SITE_PASSWORD: string;
};
```

**Steps:**

1. Write `env.schema.spec.ts` and observe focused RED.
2. Implement Zod validation and secret-safe error mapping.
3. Observe focused GREEN.
4. Add PostgreSQL service with a health check and named volume to `compose.yaml`.
5. Run `docker compose config`; expect success without displaying real `.env` values.
6. Start PostgreSQL with `npm run db:up` and verify its health through `docker compose ps`.

### Task 3: Define the Prisma schema and first migration

**Objective:** Create the minimum persistent model required by the spec.

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/*/migration.sql`
- Create: `apps/api/src/db/prisma.service.ts`
- Create: `apps/api/test/db/schema.integration.spec.ts`

**Models:**

- `User`: id, username, passwordHash, role (`ADMIN|MANAGER`), active, timestamps.
- `Session`: id, tokenHash, userId, expiresAt, revokedAt, timestamps.
- `Restaurant`: id, sourceUnitId, sourceRole, timezone, displayName, active, timestamps.
- `UserRestaurant`: userId, restaurantId, timestamps, composite unique key.
- `SyncRun`: id, restaurantId, beginDate, endDate, status, requestedById, counts, safeErrorCode, heartbeatAt, timestamps.
- `RawSnapshot`: id, syncRunId, endpoint, page, contentType, algorithmVersion, ciphertext, iv, authTag, receivedAt.
- `Employee`, `Product`, `Order`, `OrderItem`: normalized source IDs, restaurant relation, current/lastSeenSyncRunId state and fields required by reports.
- `AuditEvent`: actorId, eventType, restaurantId, syncRunId, correlationId, safe metadata and timestamp.

**Database invariants:**

- unique `(restaurantId, sourceId)` on normalized entities;
- unique `(userId, restaurantId)` assignment;
- foreign keys cannot cross restaurant ownership accidentally;
- decimal money columns use a fixed precision such as `Decimal(14,2)`;
- a partial unique index prevents two `queued|running` runs for one restaurant.

**Steps:**

1. Write an integration test that expects uniqueness and relationship constraints.
2. Run it and observe RED because schema/tables are missing.
3. Add Prisma models and generate a migration; place the partial unique index in migration SQL if Prisma cannot express it.
4. Apply migration to the test DB.
5. Run the focused test, then `npx prisma validate`; expect PASS.

---

## Phase B — deterministic source boundary

### Task 4: Create synthetic source fixtures and privacy guard

**Objective:** Encode the observed API contract without committing real operational data.

**Files:**
- Create: `test/fixtures/source/README.md`
- Create: `test/fixtures/source/permissions.success.json`
- Create: `test/fixtures/source/employees-rating.success.json`
- Create: `test/fixtures/source/employees-rating.invalid.json`
- Create: `test/privacy/source-fixtures.spec.ts`

**Fixture rules:**

- invented UUIDs, names, phones and emails only;
- at least two employees, two products, three orders, a discounted item, equal-ranking tie, and a zero-result period;
- include only enough synthetic PII fields to prove full snapshot round-tripping and log redaction;
- recursively reject URLs other than `example.invalid`, credential-like keys/values, real domain names, handles and unapproved free text.

**Steps:**

1. Write privacy/schema guard first with one deliberately forbidden sentinel; observe RED naming fixture path and nested field.
2. Replace sentinel with synthetic content; observe GREEN.
3. Add README provenance: fixture is synthetic, mimics field shape only, and is not a live-source evaluation.
4. Run broad fixture scan and consumer tests together.

### Task 5: Implement the source schemas and metric invariants

**Objective:** Fail closed when an essential source field changes.

**Files:**
- Create: `apps/api/src/source/source.schemas.ts`
- Create: `apps/api/src/source/source.schemas.spec.ts`
- Create: `apps/api/src/source/source.errors.ts`

**Required validated fields:**

- result envelope `isSuccess`, `data`;
- permission unit ID and role;
- employee source ID/display name;
- order source ID, date, `price.value`, items;
- item source ID, product source ID/name and `priceWithDiscountForOrder.value`.

Unknown fields remain allowed so the complete payload can still be encrypted. Missing or invalid required fields fail.

**RED/GREEN cases:** valid fixture, missing order ID, invalid money, missing items, `isSuccess=false`, and item sums not matching order total within one cent.

### Task 6: Enforce the GET-only endpoint allowlist

**Objective:** Make mutation impossible through the connector's public API.

**Files:**
- Create: `apps/api/src/source/source-routes.ts`
- Create: `apps/api/src/source/source-http.client.ts`
- Create: `apps/api/src/source/source-http.client.spec.ts`

**Public shape:**

```ts
type SourceOperation =
  | { kind: 'authenticate'; login: string; password: string }
  | { kind: 'permissions' }
  | { kind: 'setRole'; unitId: string; role: string }
  | { kind: 'employeeRating'; beginDate: string; endDate: string; page: number; pageSize: number };
```

There must be no generic `request(url, method)` method exposed outside this module.

**RED/GREEN cases:**

- each operation maps to its exact GET path;
- mutation verbs cannot be represented;
- unknown operation is rejected before fetch;
- source base URL must be HTTPS outside tests;
- cross-origin redirect is rejected;
- errors include endpoint key and correlation ID but omit query/password/cookies/body.

Use `tough-cookie`/`fetch-cookie` or an equivalently maintained cookie-jar implementation; do not write cookies to disk.

### Task 7: Implement authenticated paginated collection

**Objective:** Collect a complete report for one restaurant context.

**Files:**
- Create: `apps/api/src/source/source.connector.ts`
- Create: `apps/api/src/source/source.connector.spec.ts`
- Create: `test/fake-source/server.ts`

**Flow:** authenticate → permissions → locate requested `sourceUnitId` → select the restaurant's explicitly configured `sourceRole` → fetch pages until `totalRows` is covered.

**RED/GREEN cases:**

- happy path returns validated pages;
- unavailable restaurant fails before report call;
- authentication failure uses safe error code;
- page two is requested when needed;
- repeated/contradictory pagination fails instead of looping;
- empty successful result is represented distinctly from transport/contract failure;
- no test output contains source login, password or response PII sentinels.

---

## Phase C — storage and synchronization

### Task 8: Encrypt and authenticate raw snapshots

**Objective:** Store every permitted report response body without plaintext JSON in PostgreSQL.

**Files:**
- Create: `apps/api/src/sync/raw-snapshot.crypto.ts`
- Create: `apps/api/src/sync/raw-snapshot.crypto.spec.ts`
- Create: `apps/api/src/sync/raw-snapshot.repository.ts`
- Create: `apps/api/test/sync/raw-snapshot.integration.spec.ts`

**Public contract:**

```ts
type EncryptedPayload = {
  algorithmVersion: 1;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

encryptBytes(value: Buffer, key: Buffer): EncryptedPayload;
decryptBytes(payload: EncryptedPayload, key: Buffer): Buffer;
```

Use Node `crypto` AES-256-GCM with a fresh random 96-bit IV per snapshot.

**RED/GREEN cases:** byte-for-byte response-body round trip, distinct ciphertext for identical input, wrong key failure, tamper failure, and database row contains no plaintext sentinel.

### Task 9: Normalize one source page idempotently

**Objective:** Turn a validated page into queryable records while preserving the encrypted raw snapshot.

**Files:**
- Create: `apps/api/src/sync/normalizer.ts`
- Create: `apps/api/src/sync/normalizer.spec.ts`
- Create: `apps/api/src/sync/import-page.service.ts`
- Create: `apps/api/test/sync/import-page.integration.spec.ts`

**Persistence order:** encrypt/store raw response bytes in a committed snapshot transaction → parse/validate → in a separate transaction upsert employees/products/orders/items with `lastSeenSyncRunId` and update counters. If parsing or normalization fails, retain the encrypted snapshot but roll back every normalized change for that page/run.

**RED/GREEN cases:**

- fixture creates expected counts;
- second import leaves counts unchanged;
- changed product name/price updates mutable fields without changing identity;
- item revenue uses discounted-for-order value;
- duplicate source IDs inside one payload fail safely;
- normalization rollback leaves the encrypted snapshot but no partial normalized rows;
- after a complete non-empty sync, records inside the requested restaurant/date window that were not seen are marked non-current and disappear from reports;
- an unexpectedly empty re-import of a previously non-empty window fails without deactivating existing records.

### Task 10: Implement the database-backed sync queue

**Objective:** Let API enqueue and worker claim one manual job safely.

**Files:**
- Create: `apps/api/src/sync/sync-run.repository.ts`
- Create: `apps/api/src/sync/sync-run.repository.spec.ts`
- Create: `apps/api/src/sync/sync.worker.ts`
- Create: `apps/api/src/worker.ts`
- Create: `apps/api/test/sync/sync-worker.integration.spec.ts`

**State machine:**

```text
queued → running → succeeded
                 ↘ failed
```

No other transitions are valid.

**RED/GREEN cases:** atomic claim, two workers cannot claim same row, second active restaurant run conflicts, other restaurant can run, successful counts persist, failure stores only safe code, heartbeat advances while running, stale `running` is recovered to `failed`, and previous normalized data remains after failure/unexpected empty result.

### Task 11: Add the administrator sync API

**Objective:** Expose manual enqueue and status without running source calls in HTTP request lifecycle.

**Files:**
- Create: `apps/api/src/sync/sync.controller.ts`
- Create: `apps/api/src/sync/sync.service.ts`
- Create: `apps/api/src/sync/sync.dto.ts`
- Create: `apps/api/test/sync/sync-api.integration.spec.ts`

**Endpoints:**

- `POST /api/sync-runs` → `202` with sync ID/status;
- `GET /api/sync-runs` → paginated history;
- `GET /api/sync-runs/:id` → status and safe counters/error.

**RED/GREEN cases:** admin success, manager `403`, invalid/reversed/future dates `400`, active duplicate `409`, unknown restaurant `404`, and no credential fields in response.

---

## Phase D — application authentication and authorization

### Task 12: Implement password hashing and database sessions

**Objective:** Provide independent Bazols authentication.

**Files:**
- Create: `apps/api/src/auth/password.service.ts`
- Create: `apps/api/src/auth/password.service.spec.ts`
- Create: `apps/api/src/auth/session.service.ts`
- Create: `apps/api/src/auth/session.service.spec.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/test/auth/auth.integration.spec.ts`

**Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

**RED/GREEN cases:** Argon2id verification, generic invalid-login response, inactive user denied, opaque random token stored only as hash, secure cookie attributes, logout revocation, expiry, rate limiting, Origin/CSRF rejection for state changes, and no password/token in logs.

Create the first admin only through a local CLI command that reads a password interactively or from stdin without printing it; never seed a default password.

### Task 13: Enforce restaurant access and admin role

**Objective:** Centralize authorization so controllers cannot forget it.

**Files:**
- Create: `apps/api/src/auth/session.guard.ts`
- Create: `apps/api/src/auth/roles.guard.ts`
- Create: `apps/api/src/restaurants/restaurant-access.service.ts`
- Create: `apps/api/src/restaurants/restaurant-access.service.spec.ts`
- Create: `apps/api/test/auth/authorization.integration.spec.ts`

**RED/GREEN cases:** assigned manager `200`, unassigned restaurant `403`, URL/query/body substitution remains `403`, inactive user sessions revoked, admin bypass for restaurant assignments, non-admin user/sync operations `403`.

### Task 14: Implement manager and restaurant assignment administration

**Objective:** Let administrators manage the MVP user lifecycle.

**Files:**
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.dto.ts`
- Create: `apps/api/src/restaurants/restaurants.controller.ts`
- Create: `apps/api/src/restaurants/restaurants.service.ts`
- Create: `apps/api/src/restaurants/restaurants.dto.ts`
- Create: `apps/api/src/restaurants/source-discovery.controller.ts`
- Create: `apps/api/test/users/users.integration.spec.ts`
- Create: `apps/api/test/restaurants/restaurants.integration.spec.ts`

**Endpoints:** discover source units/roles read-only, create/update a restaurant mapping with explicit source role/timezone, create/list/block manager, reset password, list restaurants, and replace manager restaurant assignments.

**RED/GREEN cases:** source discovery returns only safe unit/role metadata, mapping requires a currently available unit/role and valid IANA timezone, unique username, temporary password hashed, response never returns hashes, assignments replace atomically, blocking revokes sessions, manager denied, and each action creates an audit event.

---

## Phase E — reports API

### Task 15: Implement employee ranking queries

**Objective:** Return employee revenue, order count and average cheque for an authorized restaurant/period.

**Files:**
- Create: `apps/api/src/reports/employee-ranking.service.ts`
- Create: `apps/api/src/reports/employee-ranking.service.spec.ts`
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/test/reports/employee-ranking.integration.spec.ts`
- Modify: `packages/contracts/src/index.ts`

**Formula tests:** unique orders only, decimal totals, zero denominator, date boundaries in restaurant timezone, three sort modes, stable tie-break by display name then source ID, and server-side restaurant guard.

**Endpoint:** `GET /api/restaurants/:restaurantId/reports/employees?from=&to=&sort=revenue|ordersCount|averageCheque`.

### Task 16: Implement product ranking queries

**Objective:** Return sold units and discounted revenue per product.

**Files:**
- Create: `apps/api/src/reports/product-ranking.service.ts`
- Create: `apps/api/src/reports/product-ranking.service.spec.ts`
- Create: `apps/api/test/reports/product-ranking.integration.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `packages/contracts/src/index.ts`

**Formula tests:** one unique item equals one unit, duplicate IDs cannot inflate count, discounted-for-order value drives revenue, two sort modes, stable tie-break, empty period, currency consistency and restaurant guard.

**Endpoint:** `GET /api/restaurants/:restaurantId/reports/products?from=&to=&sort=unitsSold|revenue`.

### Task 17: Add health, readiness and audit-safe logging

**Objective:** Make local operation diagnosable without leaking source or PII data.

**Files:**
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/logging/safe-logger.ts`
- Create: `apps/api/src/logging/safe-logger.spec.ts`
- Create: `apps/api/test/health/health.integration.spec.ts`

**Endpoints:** `/health/live` and `/health/ready`; readiness checks DB only and never calls the source.

**RED/GREEN cases:** recursive sentinel redaction, query stripping, correlation ID propagation, DB-down readiness failure, and audit event creation for required actions.

---

## Phase F — React web application

### Task 18: Create the Bazols theme and responsive shell

**Objective:** Establish the approved calm visual system before feature screens.

**Files:**
- Create: `apps/web/src/theme/tokens.ts`
- Create: `apps/web/src/theme/theme.ts`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/app/AppShell.spec.tsx`
- Create: `apps/web/src/main.tsx`

**Token starting point (validate contrast before finalizing):**

```ts
export const colors = {
  canvas: '#F7F8F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EDEFEB',
  ink: '#20312A',
  sage: '#60796B',
  copper: '#A96542',
  danger: '#A33F3F',
};
```

**RED/GREEN cases:** textual `Bazols` brand, skip link, keyboard-visible navigation, mobile drawer, desktop rail and reduced-motion support. Do not introduce a logo asset, gradient, glass effect or Tailwind.

### Task 19: Implement login and session bootstrap

**Objective:** Make authenticated routing work against the real NestJS endpoints.

**Files:**
- Create: `apps/web/src/auth/api.ts`
- Create: `apps/web/src/auth/AuthProvider.tsx`
- Create: `apps/web/src/auth/LoginPage.tsx`
- Create: `apps/web/src/auth/LoginPage.spec.tsx`
- Create: `apps/web/src/app/router.tsx`

**RED/GREEN cases:** valid login redirect, generic invalid login, loading session, expired session redirect, logout, accessible labels/errors and disabled submit while pending.

### Task 20: Implement the rankings workspace

**Objective:** Deliver the primary manager workflow.

**Files:**
- Create: `apps/web/src/reports/ReportsPage.tsx`
- Create: `apps/web/src/reports/ReportToolbar.tsx`
- Create: `apps/web/src/reports/EmployeeRankingTable.tsx`
- Create: `apps/web/src/reports/ProductRankingTable.tsx`
- Create: `apps/web/src/reports/api.ts`
- Create: `apps/web/src/reports/*.spec.tsx`

**UI contract:** one operational toolbar with restaurant, from/to dates and last successful sync; tabs for employees/products; metric toggle; rank/name/all metric columns; loading skeleton; empty guidance; error with retry; stale-data warning after failed sync.

**RED/GREEN cases:** only assigned restaurants shown, initial selection deterministic, query key includes restaurant/period/sort, metric switch reorders from API result, mobile horizontal table behavior, all required states and keyboard access.

### Task 21: Implement admin users and sync screens

**Objective:** Deliver administrator-only management and manual import.

**Files:**
- Create: `apps/web/src/admin/UsersPage.tsx`
- Create: `apps/web/src/admin/ManagerDialog.tsx`
- Create: `apps/web/src/admin/SyncPage.tsx`
- Create: `apps/web/src/admin/SyncRunTable.tsx`
- Create: `apps/web/src/admin/*.spec.tsx`

**RED/GREEN cases:** role-based navigation, create/block/reset flows, restaurant multi-assignment, date validation, enqueue confirmation, active-run disabled state, status polling, safe error rendering and manager route denial.

---

## Phase G — end-to-end proof and documentation

### Task 22: Build a local fake source and full vertical E2E test

**Objective:** Exercise the real entry points without touching the external system.

**Files:**
- Modify: `test/fake-source/server.ts`
- Create: `apps/web/e2e/mvp-flow.spec.ts`
- Create: `playwright.config.ts`
- Modify: root `package.json`

**Scenario:** start PostgreSQL + fake source + API + worker + web; create admin securely; login; discover source units/roles; map a restaurant with role/timezone; enqueue sync; wait for success; verify employee and product rankings; create manager with one restaurant; verify that manager cannot open another restaurant or admin pages.

**Negative scenario:** fake source returns changed schema; sync fails with safe code; previous ranking remains visible; browser and captured server output contain no fixture PII sentinels.

Run `npm run test:e2e`; expect all scenarios PASS.

### Task 23: Run security and fixture regression checks

**Objective:** Prove the highest-risk boundaries before delivery.

**Files:**
- Create: `test/privacy/repository-scan.spec.ts`
- Create: `test/security/source-boundary.spec.ts`
- Create: `test/security/log-redaction.spec.ts`

**Checks:**

- tracked files contain no real source hostname, credentials or known sensitive sentinels;
- fixture key allowlist and recursive privacy scan pass;
- source client exposes no generic mutation method;
- dependencies contain no Tailwind or MUI X commercial packages;
- raw snapshot database column does not contain plaintext fixture JSON;
- authorization matrix passes.

Run focused tests, then the full suite.

### Task 24: Update operational documentation and verify from clean state

**Objective:** Make a new developer able to run and inspect the MVP using only tracked documentation.

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` Commands block
- Create: `docs/runbooks/local-development.md`
- Create: `docs/runbooks/manual-sync.md`
- Create: `docs/security/data-handling.md`
- Modify: `.env.example`

**Documentation must include:** exact install/run/test/build commands; secret generation without displaying values; first-admin creation; manual sync; source allowlist; snapshot encryption; indefinite retention; backup caveat; known absence of cost data; troubleshooting by safe error code.

**Clean verification:**

```bash
npm ci
npm run db:up
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:e2e
sh scripts/validate-template.sh
sh tests/test-template.sh
git diff --check
git status --short
```

Record exact command outputs and counts in the delivery report. Do not claim a real-source smoke test unless it was separately approved and actually run.

---

## 4. Vertical implementation checkpoints

Use these checkpoints rather than building all backend code before any visible result:

1. **Foundation:** workspace + DB + environment validation.
2. **Safe ingestion tracer:** fake source → connector → encrypted snapshot → one normalized page.
3. **First report tracer:** normalized fixture → employee report API → minimal table.
4. **Second report:** product aggregation and tab.
5. **Security:** sessions, manager restaurant guard, admin sync.
6. **Operational completion:** worker state machine, admin screens, E2E, docs.

At every checkpoint, preserve a runnable main branch/worktree and show actual test evidence. Commits are optional and require explicit user approval in this repository.

## 5. Important implementation decisions

### Why internal API instead of HTML parsing

The confirmed JSON endpoint already supplies the required orders/items. API integration is faster, deterministic and easier to validate. Playwright remains for discovery and browser E2E only. HTML parsing is not implemented unless a future required field is proven absent from network responses.

### Why encrypted raw plus normalized data

The complete source response fulfills the retention requirement and supports later reprocessing. Normalized tables make reports fast and enforce idempotency. The raw payload is never a frontend DTO.

### Why PostgreSQL queue

Manual MVP sync volume does not justify Redis. A row-based queue plus `SKIP LOCKED` gives a separately runnable worker and crash-visible state with one existing dependency.

### Why source credentials remain in environment

MVP has one approved source integration and does not need credential-management UI. Database credential storage and key management would add risk without a current caller.

## 6. Open implementation assumptions to verify during Task 7

- A source unit maps one-to-one to a Bazols `Restaurant`.
- The first permission role for a unit is never selected implicitly; the administrator maps a restaurant to an explicit source role value discovered from permissions.
- Source dates are interpreted in a configured restaurant timezone, not the host timezone.
- One `OrderItem` record is one sold unit because the observed contract has no quantity field.
- `priceWithDiscountForOrder.value` is the actual product revenue allocation because its sum matched all 151 sampled order totals.

If any assumption fails against the fake contract or an approved read-only source smoke check, stop and amend `docs/specs/bazols-reporting-mvp.md` before changing production behavior.

## 7. Completion gate

Implementation is complete only when:

- AC-01 through AC-14 have executable evidence;
- canonical lint, typecheck, unit, integration, build and E2E commands pass;
- the fake-source vertical flow works through real API/worker/browser entry points;
- no secret or PII sentinel appears in logs or tracked fixtures;
- docs reproduce the clean local setup;
- remaining gaps explicitly name cost/technical-card discovery, price notifications, automated scheduling and deployment.
