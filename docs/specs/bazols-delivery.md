# Bazols — Docker, GitHub и Production Delivery Spec

**Статус:** VPS частично подготовлена; дальнейшая Production activation отложена в `docs/backlog.md`, локальная реализация MVP разрешена
**Дата:** 2026-09-15
**Связано:** `docs/specs/bazols-reporting-mvp.md`

## 1. Цель

Определить воспроизводимую сборку, проверку и доставку Bazols на один Linux VPS без сборки исходного кода на production-сервере и без передачи исходных credentials в GitHub Actions.

## 2. Выбранное направление

- Runtime target: отдельная VM на Proxmox с Debian 13, 2 vCPU, 4 GiB RAM и диском 40 GiB.
- Оркестрация MVP: Docker Engine + Docker Compose plugin.
- Публичный HTTPS/reverse proxy: существующий NAS; VM-side gateway: Caddy в контейнере на приватном ingress-порту, доступном только от NAS.
- База: PostgreSQL в отдельном контейнере и persistent volume.
- Registry: GitHub Container Registry (`ghcr.io`).
- Репозиторий: `PipNalip/bazols`.
- Текущая видимость репозитория: public; изменение видимости требует отдельного решения пользователя.
- CI: GitHub-hosted runners.
- Deployment: Production запускается оператором вручную с доверенной рабочей станции через существующий приватный SSH/Tailscale path; GitHub runner не подключается к tailnet.
- API и worker запускаются из одного immutable OCI image по одному digest.
- Production deployment и DNS-изменения всегда являются отдельным подтверждённым действием.

## 3. Контейнерная архитектура

```text
Internet
  │ 80/443
  ▼
NAS TLS/reverse proxy
  │ private LAN, allowlisted source
  ▼
Caddy on VM
  │ private Docker network
  ▼
app (NestJS + React static assets)
  │
  ├────────► postgres
  │
worker ────► postgres
  │
  └────────► source API (HTTPS, allowlisted GET)

migrate ──► postgres   # one-shot, same image digest
backup  ──► postgres   # one-shot before migration
```

### 3.1 Один application image

Один multi-stage `Dockerfile` собирает contracts, React и NestJS. Полученный runtime image используется тремя способами:

- `app`: запускает HTTP API и раздаёт React build;
- `worker`: запускает DB-backed sync worker;
- `migrate`: выполняет Prisma production migrations.

Это гарантирует одинаковый код и Prisma client у API, worker и migration job.

### 3.2 Production Compose services

- `proxy`: Caddy публикует только согласованный приватный VM ingress-port; публичные 80/443 остаются на NAS.
- `app`: без host port; доступен только proxy и private network.
- `worker`: без host port.
- `postgres`: без host port, persistent volume `postgres_data`.
- `migrate`: profile/one-shot service, не перезапускается постоянно.
- `backup`: profile/one-shot service либо root-owned host script.

API и worker не используют общий bind mount или файловую очередь. Состояние заданий находится в PostgreSQL.

## 4. Dockerfile contract

Multi-stage build:

1. `deps`: lockfile-only `npm ci`.
2. `build`: Prisma generate, contracts build, web build, API build, tests already run by CI.
3. `runtime-deps`: production-only dependencies.
4. `runtime`: compiled output, Prisma runtime files and React assets only.

Обязательные свойства runtime image:

- non-root user;
- `NODE_ENV=production`;
- no `.env`, source files, tests, npm cache or real fixtures;
- OCI labels for repository, revision and version;
- read-only root filesystem where application behavior permits;
- writable `tmpfs` only for `/tmp` when required;
- init process enabled by Compose;
- graceful shutdown for API and worker;
- no Docker socket mount;
- no Playwright browsers unless runtime connector proves they are necessary.

Base image and GitHub actions are pinned to immutable digests/full commit SHAs. Dependabot proposes controlled updates.

## 5. Networks, ports and data

- `edge`: NAS ↔ VM Caddy ↔ app; VM ingress ограничивается адресом NAS средствами выбранного firewall.
- `backend`: app/worker/migrate/backup ↔ postgres, marked internal where supported.
- PostgreSQL is never bound to `0.0.0.0`.
- Source API credentials exist only in root-owned server configuration.
- Source cookies remain memory-only and have no volume.
- PostgreSQL normalized PII is protected by server/storage controls.
- Raw source payloads additionally use application AES-256-GCM encryption.

Persistent state:

- Docker volume for PostgreSQL;
- Caddy data/config volumes for certificates;
- root-owned encrypted backup directory.

Application containers themselves are replaceable and contain no unique state.

## 6. Configuration and secrets

### GitHub repository

GitHub Actions не получает SSH/Tailscale credentials и не имеет сетевого пути к Production. GitHub используется для CI и публикации immutable image в GHCR. Deployment identity и SSH host verification хранятся только на доверенной операторской рабочей станции.

### VPS only

The following never enter GitHub Secrets or workflow logs:

- `DATABASE_URL` / PostgreSQL password;
- `SESSION_SECRET`;
- `RAW_DATA_ENCRYPTION_KEY`;
- `SOURCE_SITE_URL`;
- `SOURCE_SITE_LOGIN`;
- `SOURCE_SITE_PASSWORD`;
- GHCR read credential;
- backup encryption material.

They are stored in `/opt/bazols/secrets/prod.env`, owned by root and readable only by the controlled deployment/runtime path. The file is never copied into an image.

For a private GHCR package, the server uses a server-local token with package read-only scope. GitHub Actions uses its ephemeral `GITHUB_TOKEN` only to publish the image.

## 7. GitHub development process

### Branches and pull requests

- `main` is the only long-lived branch.
- Work happens in `feat/*`, `fix/*`, `docs/*`, `ci/*` branches.
- Changes enter `main` through pull requests.
- Preferred merge method: squash.
- Direct pushes to `main` are disabled after branch protection is configured.

Required checks before merge:

1. lint;
2. typecheck;
3. unit tests;
4. integration tests with ephemeral PostgreSQL;
5. frontend build;
6. API/worker build;
7. Docker image build without push;
8. fake-source E2E;
9. fixture/privacy and secret scan.

Fork pull requests receive no production secrets and cannot deploy.

### Workflow permissions

Every workflow starts with `permissions: { contents: read }` and adds only required rights per job. PR workflows do not get `packages: write`, `id-token: write`, production secrets or SSH credentials. Third-party actions are pinned by full commit SHA.

## 8. GitHub Actions workflows

### `.github/workflows/ci.yml`

**Trigger:** pull requests and pushes to `main`.

**Purpose:** install from lockfile, lint, typecheck, run unit/integration/E2E tests, build application and verify Docker build. Does not push an image and does not access VPS or source API.

**Configuration source:** tracked test configuration plus GitHub job-local synthetic values. All API tests use the local fake source.

### `.github/workflows/publish-image.yml`

**Trigger:** release tag `v*` after green `main`, or an explicitly approved manual dispatch constrained to a commit already on `main`.

**Purpose:** build the image once, push to `ghcr.io/pipnalip/bazols`, generate SBOM/provenance attestation, and report the exact digest.

**Artifact identity:** canonical identity is `ghcr.io/pipnalip/bazols@sha256:<digest>`. Mutable tags (`vX.Y.Z`, Git SHA) are conveniences only and are never the production source of truth.

**Permissions:** `contents: read`, `packages: write`, and only the attestation permissions required by the current official GitHub documentation.

### Manual Production deployment

**Trigger:** оператор вручную запускает локальную deploy-команду с обязательным immutable image digest после отдельного подтверждения Production deployment.

**Concurrency:** server-side deployment lock допускает ровно один deployment; второй запуск не отменяет уже выполняющиеся migrations.

**Purpose:** доверенная рабочая станция подключается через существующий приватный Tailscale/SSH path как контролируемый deploy user и вызывает один root-owned server deployment entry point с точным image reference. Исходники, `.env`, compose files и database dumps не загружаются.

Use no `StrictHostKeyChecking=no`. Host identity is validated against `PROD_SSH_HOST_KEY`.

## 9. Server deployment contract

Expected root-owned layout:

```text
/opt/bazols/
  compose.yaml
  Caddyfile
  secrets/prod.env
  bin/deploy
  bin/backup-postgres
  state/current-image
  state/previous-image
  backups/
```

The deployment entry point accepts only an image in the form:

```text
ghcr.io/pipnalip/bazols@sha256:<64 hex chars>
```

High-level deployment algorithm:

1. acquire an exclusive deployment lock;
2. verify caller input and available disk;
3. authenticate/pull the exact image digest;
4. run image/config compatibility preflight;
5. create and verify a PostgreSQL backup;
6. store current image as previous image;
7. run `prisma migrate deploy` using the target image;
8. update `BAZOLS_IMAGE` atomically;
9. recreate `app` and `worker` from the same digest;
10. wait for Compose health and `/health/live` + `/health/ready`;
11. record deployed digest and outcome;
12. on application health failure, restore the previous image reference and recreate app/worker;
13. never automatically restore the database after a migration failure—stop and require an explicit recovery decision.

The server never runs `git pull`, `npm install` or `docker build` for a Production release.

## 10. Health checks

- `app /health/live`: process event loop is responsive; no external source call.
- `app /health/ready`: app can query PostgreSQL and required schema is compatible.
- `worker` health: process heartbeat plus recent DB worker heartbeat; no source call.
- `postgres`: `pg_isready` scoped to the internal container.
- `proxy`: VM-side request through Caddy plus public HTTPS request through NAS after ingress activation.

Source API availability does not make the whole application unready; it affects only a sync run.

## 11. Backup and retention

Before every migration:

- create a consistent PostgreSQL backup;
- verify command success and non-empty artifact;
- encrypt backup before any off-host transfer;
- name it with UTC timestamp and pre-deploy image digest;
- retain enough backups to satisfy the later operational policy.

Recommended off-host backup encryption is recipient-based (`age`) with the private recovery key kept outside the VPS. Backup destination, frequency and retention require a separate decision before Production activation.

A Docker volume is not a backup.

## 12. Rollback

### Application rollback

Use `/opt/bazols/state/previous-image`, pull/verify that immutable digest, recreate both `app` and `worker`, then re-run health checks.

### Database rollback

Migrations follow expand/contract:

- additive schema first;
- compatible application release second;
- data migration separately;
- destructive schema removal only in a later explicitly approved release.

Automatic DB rollback is prohibited. If a migration caused irreversible damage, restoration from the verified encrypted backup is a separate destructive action requiring explicit approval.

## 13. Ownership and approval gates

- Product/code owner: repository owner (`PipNalip`) unless changed explicitly.
- Production deployment owner: user or designated operator; exact person/account must be confirmed before environment activation.
- Server agent may prepare the host according to the companion prompt but may not deploy Bazols, change DNS, restore/delete data, or expose new ports without explicit approval.
- Publishing the first image, creating GitHub environments/secrets, changing repository visibility, enabling branch protection and deploying are separate external writes requiring confirmation.

## 14. Server readiness snapshot

Self-report серверного агента, полученный 2026-09-15; независимый readback из этой рабочей сессии не выполнялся:

- отдельная Proxmox VM создана на Debian 13, 2 vCPU, 4 GiB RAM и диске 40 GiB;
- сообщено примерно 37 GiB свободного места;
- Docker Engine 29.8.0 и Compose 5.5.1 установлены по официальной инструкции;
- `hello-world` прошёл;
- `/opt/bazols` и `secrets/prod.env` подготовлены, сообщён mode `0600`;
- `bazols-deploy` не состоит в `docker` group и пока не имеет sudo;
- Compose/Caddy/deploy/backup существуют только как non-executable pending templates;
- контейнеры Bazols отсутствуют, application image не загружен;
- SSH слушает 22, 80/443 на VM свободны, failed systemd units и чужие контейнеры не обнаружены;
- firewall вручную не изменялся, Docker добавил свои стандартные network chains;
- Proxmox firewall выключен;
- публичный 80/443 ingress сейчас приходит на NAS, маршрут NAS → VM не настроен.
- последующий server-agent readback подтвердил enrollment VM в ожидаемый tailnet и доступ к ней с Proxmox через Tailscale;
- прежний административный SSH path продолжает работать;
- Tailscale SSH выключен, subnet routes и exit-node mode отсутствуют;
- Tailscale address и MagicDNS name сохранены только в закрытом файле на VM;
- последующий read-only readback подтвердил фактический `tag:bazols-prod`, online status и active `tailscaled`; VM-side transport status — `TAILSCALE_READY`;
- отдельная deploy policy и GitHub workload identity federation исключены из выбранной схемы по решению владельца; GitHub не получает доступ в tailnet.

Это состояние классифицируется как `PARTIALLY_READY`, не `env-ready` и не `prod-ready`.

## 15. Current gaps before activation

- Нужно утвердить NAS reverse-proxy route, приватный VM ingress-port и ограничение source IP до NAS.
- VM-side Tailscale enrollment и `tag:bazols-prod` подтверждены; GitHub deploy identity/federation не создаются. Перед ручным deployment нужно проверить операторский SSH key, pinned host identity и server-side deployment lock.
- Нужны стабильная адресация VM и выбранный owner сетевой настройки.
- Domain name and DNS owner are not specified.
- SSH deployment identity/public key is not specified.
- Backup destination, retention and `age` recipient are not specified.
- Backup restore ещё не тестировался.
- Production owner/reviewer GitHub account is not specified.
- Repository is currently public; private/public decision remains explicit.
- Dockerfiles, Compose and workflows do not yet exist.
- Application health endpoints do not yet exist.

This spec authorizes design and local implementation only. It does not authorize changing GitHub settings, provisioning the VPS, publishing images or deploying Production.
