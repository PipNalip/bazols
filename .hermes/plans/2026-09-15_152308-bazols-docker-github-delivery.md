# Bazols Docker and GitHub Delivery Implementation Plan

> **For Hermes:** Implement task-by-task with RED → GREEN verification. External writes—GitHub settings, package publication, VPS changes, DNS and deployment—require separate explicit approval.

**Goal:** Build Bazols once in GitHub Actions, publish one immutable OCI image for API/worker/migrations, and deploy that digest safely to one Docker Compose VPS with backup, health checks and rollback.

**Delivery spec:** `docs/specs/bazols-delivery.md`
**Server prompt:** `docs/prompts/bazols-vps-preparation-agent.md`
**Application plan:** `.hermes/plans/2026-09-15_133432-bazols-reporting-mvp.md`

## Acceptance criteria

- AC-D01: PR CI uses synthetic data only and receives no Production/source secrets.
- AC-D02: runtime image contains compiled app only, runs non-root, and contains neither `.env` nor test fixtures.
- AC-D03: API, worker and migration use the same image digest.
- AC-D04: PostgreSQL has persistent storage and no published host port.
- AC-D05: NAS owns public 80/443; only VM Caddy publishes the selected private ingress-port, restricted to NAS, while application and PostgreSQL ports remain private.
- AC-D06: Production deployment accepts an immutable GHCR digest, never a mutable-only tag.
- AC-D07: deployment creates and verifies a backup before migration.
- AC-D08: failed application health causes image rollback; DB restoration is never automatic.
- AC-D09: health checks distinguish process/database readiness from source API availability.
- AC-D10: branch protection requires canonical CI before merge.
- AC-D11: Production deployment is manual, protected by GitHub Environment approval and serialized.
- AC-D12: server/source/database secrets remain on VPS and never enter GitHub Actions.
- AC-D13: SSH uses a pinned host key; `StrictHostKeyChecking=no` is absent.
- AC-D14: no source build, `npm install` or `git pull` occurs on Production.
- AC-D15: server preparation can be audited independently and does not itself deploy Bazols.

## Phase 0 — decisions and gates

### Task 1: Resolve activation inputs

**Files:**
- Update: `docs/specs/bazols-delivery.md`

Record before any external action:

- final VPS OS/address owner (address stays secret if appropriate);
- `BAZOLS_DOMAIN` and DNS owner;
- Production deploy owner/reviewer GitHub account;
- public vs private repository decision;
- GHCR package visibility;
- SSH deployment public key and allowed source policy;
- backup destination, retention and `age` recipient;
- whether Production is the only remote environment.
- NAS → VM ingress route, VM-private Caddy port and firewall owner;
- Production transport: manual operator deployment from a trusted workstation over the existing private Tailscale/SSH path. GitHub receives no tailnet or SSH access.

**Default MVP recommendation:** local development + synthetic CI + one Production VPS. Do not create a staging environment containing real PII. If staging is later required, use a separate database/server and synthetic or explicitly approved sanitized data.

**Gate:** user approves the completed delivery spec. Silence is not approval.

## Phase 1 — container contract

### Task 2: Add Docker ignore contract first

**Files:**
- Create: `tests/delivery/docker-context.test.mjs`
- Create: `.dockerignore`

**RED:** test fails while `.dockerignore` is absent. It must verify exclusion of `.git`, `.github` where not build-required, `.env*` except explicit example policy, real fixtures, test outputs, coverage, local DB/backups, `.hermes`, docs and node caches.

**GREEN:** add minimum `.dockerignore`; run test.

**Verify:** `node --test tests/delivery/docker-context.test.mjs`.

### Task 3: Build one multi-stage application image

**Files:**
- Create: `Dockerfile`
- Create: `docker/entrypoint.sh`
- Create: `tests/delivery/image-structure.test.mjs`
- Update: root `package.json`

**RED:** structure test proves no Dockerfile or required stages/labels/non-root user.

**GREEN:** implement dependency, build, production dependency and runtime stages. Add explicit commands for `api`, `worker`, `migrate`, and `preflight` without shell evaluation.

**Verify:**

```bash
npm run test:delivery
npm run build
docker build --label org.opencontainers.image.revision=test -t bazols:test .
docker inspect bazols:test
```

Inspect actual image user, labels, entrypoint, size and layers. Run a container-level check proving `/app/.env` and real fixtures are absent.

### Task 4: Add graceful runtime health behavior

**Files:**
- Modify: `apps/api/src/health/*`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/worker.ts`
- Create/modify focused health tests

**RED:** tests fail for missing liveness/readiness/worker heartbeat behavior.

**GREEN:** implement:

- `/health/live`: process-only;
- `/health/ready`: PostgreSQL/schema compatibility;
- worker heartbeat stored in DB;
- source API excluded from app readiness;
- graceful SIGTERM drain for API and worker.

**Verify:** unit/integration tests and actual container health commands.

## Phase 2 — Compose

### Task 5: Development Compose

**Files:**
- Create: `compose.yaml`
- Create: `docker/env/development.example`
- Create: `tests/delivery/compose-config.test.mjs`

**RED:** test rejects missing services, public DB ports, mutable implicit images or secret values.

**GREEN:** define local PostgreSQL, app and worker with development-safe configuration. Keep dev behavior explicit and separate from Production.

**Verify:** `docker compose config` and focused tests. If application slice exists, run stack and exercise login/fake sync/report.

### Task 6: Production Compose and Caddy

**Files:**
- Create: `compose.production.yaml`
- Create: `docker/Caddyfile`
- Create: `docker/env/production.example`
- Extend: `tests/delivery/compose-config.test.mjs`

**RED:** test rejects published DB/app ports, public VM 80/443 bindings, missing health checks, different API/worker images, mutable-only image reference, privileged mode, Docker socket and secret-like literals.

**GREEN:** implement proxy/app/worker/postgres plus one-shot migrate/backup profiles. Caddy binds only the approved private VM ingress endpoint for NAS forwarding. Require `BAZOLS_IMAGE` as exact digest and server-local `env_file`/secret paths. Add restart policies, health checks, internal network, init and resource/log defaults.

**Verify:**

```bash
docker compose -f compose.production.yaml --env-file docker/env/production.example config
npm run test:delivery
```

Config rendering uses dummy values only and must not contact Production.

## Phase 3 — operational scripts

### Task 7: Backup script with a fake PostgreSQL harness

**Files:**
- Create: `ops/bin/backup-postgres`
- Create: `tests/delivery/backup-postgres.test.mjs`
- Create: `tests/delivery/fakes/*`

**RED cases:** dump failure, empty dump, encryption failure, missing recipient, safe filename, successful encrypted artifact. Tests use fake executables and no real database.

**GREEN:** root-safe script with strict mode, restrictive umask, temporary file cleanup trap, encrypted final artifact, atomic rename and machine-readable outcome without secrets.

**Verify:** delivery tests plus shell syntax/lint.

### Task 8: Deployment script with fake Docker/HTTP harness

**Files:**
- Create: `ops/bin/deploy`
- Create: `tests/delivery/deploy.test.mjs`

**RED cases:**

- reject tag-only image;
- reject wrong registry/name;
- lock contention;
- insufficient disk;
- pull/preflight/backup/migration failure;
- app health failure rolls image back;
- worker and API always receive the same digest;
- no DB restore command is invoked;
- success records exact current/previous digest atomically.

**GREEN:** implement only the tested orchestration. Never accept arbitrary commands or compose files from workflow input.

**Verify:** tests, shellcheck if available, and a disposable local Compose smoke environment.

### Task 9: VPS install/runbook artifacts

**Files:**
- Create: `ops/server/install-layout.sh`
- Create: `ops/server/bazols-deploy.sudoers`
- Create: `docs/runbooks/server-preparation.md`
- Create: `docs/runbooks/production-deploy.md`
- Create: `docs/runbooks/production-rollback.md`
- Test: `tests/delivery/server-layout.test.mjs`

Script must be idempotent, refuse conflicting existing files, create strict ownership, install no packages silently, and never deploy. Sudoers grants only the exact root-owned deployment entry point after validation with `visudo -cf`.

**Gate:** execute on VPS only after separate explicit approval and Phase 1 audit from the companion server prompt.

## Phase 4 — GitHub CI and image publication

### Task 10: Canonical CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `tests/delivery/workflows.test.mjs`

**RED:** static workflow tests reject excessive permissions, unpinned actions, Production environment/secrets in PR jobs, missing canonical commands, source network access and mutable dependency install.

**GREEN:** CI on PR/push to main:

1. checkout;
2. runtime setup and cache keyed by lockfile;
3. `npm ci`;
4. lint;
5. typecheck;
6. unit tests;
7. PostgreSQL integration tests;
8. build;
9. fake-source E2E;
10. Docker build without push;
11. fixture/privacy/secret scan.

Use synthetic secrets generated inside the job. No source credentials.

**Verify:** local YAML/static tests and GitHub run on a feature PR after push approval.

### Task 11: Publish immutable image workflow

**Files:**
- Create: `.github/workflows/publish-image.yml`
- Extend: `tests/delivery/workflows.test.mjs`

**RED:** reject PR trigger, missing package permissions, missing immutable digest output, unpinned actions or deployment steps.

**GREEN:** release tag/manual-main-only build and publish to GHCR, OCI labels, SBOM/provenance attestation and digest summary. It builds once and does not deploy.

**Verify:** workflow static test. First package publication is an external write and requires explicit approval.

### Task 12: Manual Production deployment workflow

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Extend: `tests/delivery/workflows.test.mjs`

**RED:** reject non-manual triggers, tag-only input, absent `production` environment, absent concurrency, host-key bypass, source/database secrets and arbitrary remote command.

**GREEN:** validate exact digest, request a GitHub OIDC token, create an ephemeral `tag:bazols-deploy` Tailscale node using federated client ID/audience, prove connectivity to the `tag:bazols-prod` VM, install pinned known_hosts entry, SSH directly as `bazols-deploy` to the fixed entry point, and emit digest/health result. Never use an OAuth secret/auth key or root jump identity.

**Verify:** static tests. First remote invocation requires explicit deployment approval even if workflow is configured.

## Phase 5 — repository settings

### Task 13: Configure GitHub repository protections

**External changes; separate approval required.**

Planned settings:

- protect `main`;
- require PR;
- require canonical CI checks and branch up-to-date;
- block force-push/deletion;
- enable squash merge;
- create `production` Environment;
- assign required reviewer;
- set deployment branch/tag policy;
- add only transport secrets;
- decide repository and GHCR package visibility.

Read back every setting after applying. Never report protection as active based only on a successful request.

### Task 14: Prepare VPS

Use `docs/prompts/bazols-vps-preparation-agent.md` on the target server. Collect its structured report. Verify independently that no app deployed, no firewall/DNS changed, permissions are strict, and pending templates are not executable.

**External changes; separate approval required.**

Server-agent readback received 2026-09-15: VM-side status is `TAILSCALE_READY`; enrollment in the expected tailnet, online state, active `tailscaled`, `tag:bazols-prod`, and disabled Tailscale SSH/routes/exit-node were confirmed from VM and Proxmox. Overall delivery remains `PARTIALLY_READY`. The proposed deploy grant is not approved for activation: built-in tests were not run, the existing policy was not read, and proposed negative tests covered only VM ports 80/443, so an existing broad rule could still grant extra access. Full-policy review, preserved admin-access tests, deploy public key, GitHub federation, ingress, credentials, encrypted off-host backup and restore rehearsal remain pending.

## Phase 6 — end-to-end delivery rehearsal

### Task 15: Disposable local release rehearsal

Build an immutable local image, run backup/migrate/app/worker through disposable Compose, exercise health and fake-source sync, intentionally fail readiness, and prove image rollback. Destroy only agent-created disposable resources after explicit permission where required.

### Task 16: Production preflight

Before first deployment verify:

- domain resolves to the NAS public edge and the NAS host route forwards only the Bazols hostname to the intended VM ingress;
- VM firewall allows that ingress only from NAS and preserves approved SSH access;
- approved GitHub private transport reaches `bazols-deploy` directly without a root jump identity;
- Production env and reviewer active;
- exact published digest exists and attestation is inspectable;
- VPS can pull digest;
- secrets complete but not printed;
- encrypted backup plus off-host transfer and restore rehearsal passed;
- health endpoints passed in image;
- previous-image behavior tested;
- migration reviewed as backward-compatible.

### Task 17: First Production deployment

**External action; requires explicit approval naming the exact digest and target.**

Run manual deployment workflow, capture workflow run ID, image digest, backup identifier, migration result and health evidence. Do not claim success until HTTPS UI, API readiness, worker heartbeat and database state are verified from the target runtime.

## Final verification commands after implementation

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run test:delivery
npm run build
docker build -t bazols:verify .
docker compose -f compose.production.yaml --env-file docker/env/production.example config
sh scripts/validate-template.sh
sh tests/test-template.sh
git diff --check
git status --short
```

No commit, push, GitHub setting, package publication, server preparation or deployment is implied by this plan.
