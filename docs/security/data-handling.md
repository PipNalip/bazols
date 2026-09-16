# Data handling and privacy boundaries

## Classification

Bazols processes restaurant reporting data that may contain employee and customer PII. Source credentials, session cookies, password hashes, raw source responses and encryption keys are sensitive. Git, browser-visible errors, normal logs, support messages and screenshots are not approved storage for them.

## Source boundary

- The source integration is read-only and exposes only four allowlisted GET operations: authenticate, permissions, role selection and employee rating.
- Arbitrary URLs and mutation methods are not exposed by the connector.
- HTTPS is required except for loopback-only test servers in `NODE_ENV=test`.
- Cross-origin redirects and same-origin redirects outside the route allowlist are rejected.
- Source credentials live only in runtime environment variables. They must not be entered in the Bazols UI, committed, logged or sent through CI artifacts.

## Storage

- Raw source response bytes are encrypted with authenticated encryption before PostgreSQL storage.
- `RAW_SNAPSHOT_ENCRYPTION_KEY` is external configuration and must be backed up separately from the database.
- Normalized reporting rows remain scoped by `restaurantId`.
- A failed import does not publish partial normalized data and does not replace the last successful report.
- MVP records and encrypted snapshots are retained indefinitely until the separately approved retention/deletion procedure is implemented.
- Authentication stores Argon2 password hashes and hashed opaque session tokens; cookies are `HttpOnly` and `SameSite=Strict`.

## Logging and errors

Allowed operational fields are correlation ID, safe error code, endpoint key, status, timing, row/page counts and entity IDs when needed for audit. Do not log request/response bodies, query strings carrying source credentials, authorization headers, cookies, passwords, customer/employee contact data or decrypted snapshots.

Public API errors return a stable code, a safe message and correlation ID. Investigate sensitive detail only through an approved local procedure.

## Test data

Tracked source fixtures are synthetic and enforced by `test/privacy/source-fixtures.spec.ts`: reserved domains, reserved phone range, synthetic names and an allowlisted schema. `test/security/repository-boundaries.spec.ts` prevents tracked local credential files, private-key material, Tailwind and commercial MUI X dependencies.

E2E must use a dedicated disposable database. Never run browser/integration suites against Production or a copied database containing real PII.

## Operator rules

- Keep `.env` untracked and restrict filesystem access to the service operator.
- Rotate a credential immediately if it appears in a commit, log, screenshot or chat; deleting the occurrence is not sufficient.
- Do not copy raw snapshots into tickets. Record only run ID, safe code and correlation ID.
- Database backup activation, retention, deletion and restore rehearsal remain Production delivery decisions in `docs/backlog.md`; local MVP completion does not claim they are operational.
- A Docker volume is not a backup. Any future backup contains normalized PII; the snapshot encryption key must be stored separately, and losing it makes encrypted snapshots unrecoverable.
- Cost/margin data and technical cards are not present in this MVP.
