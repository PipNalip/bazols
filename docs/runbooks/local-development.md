# Local development

## Prerequisites

- Node.js 22
- npm
- Docker with Compose
- Chromium for Playwright (`npx playwright install chromium` when E2E is needed)

## First setup

1. Install dependencies:

   ```bash
   npm ci --include=dev
   ```

2. Create local configuration:

   ```bash
   node scripts/create-local-env.mjs
   ```

   This writes database/session/encryption secrets directly to a mode-`0600` `.env` without displaying them and refuses to overwrite an existing file.

3. In `.env`, replace only the source `replace-with-*` values with the approved source URL and read-only credentials. Keep them only in this untracked file.
4. Start PostgreSQL and apply migrations:

   ```bash
   npm run db:up
   npm run db:migrate
   ```

5. Create the first administrator without placing the password in shell history:

   ```bash
   read -rsp 'Temporary admin password: ' BAZOLS_ADMIN_PASSWORD; echo
   printf '%s' "$BAZOLS_ADMIN_PASSWORD" | npm run create-admin --workspace @bazols/api -- admin
   unset BAZOLS_ADMIN_PASSWORD
   ```

## Run the application

Use three terminals after PostgreSQL is healthy:

```bash
npm run build && npm run start --workspace @bazols/api
npm run start:worker --workspace @bazols/api
npm run dev --workspace @bazols/web
```

Open `http://127.0.0.1:5173`. The API live endpoint is `http://127.0.0.1:8000/health/live`.

The API process accepts requests and queues imports. The worker is a separate required process; queued synchronizations do not complete when it is stopped.

## First usable flow

1. Sign in as the administrator.
2. Open **Синхронизация**.
3. Select **Добавить ресторан**. Bazols reads available source units and roles using the configured read-only source account.
4. Enter a display name and an IANA timezone, select the discovered unit and role, and save.
5. Select an inclusive date range and start synchronization.
6. Wait for **Завершена** in the run journal.
7. Open **Рейтинги** and verify employee and product tables.
8. Open **Пользователи** to create a manager and assign one or more restaurants.

## Verification

Fast repository gates:

```bash
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
```

Full real-process browser flow (fake source + API + worker + web + Chromium):

```bash
npm run test:e2e
```

E2E requires an isolated migrated database through `TEST_DATABASE_URL` or `DATABASE_URL`; never point it at a database containing user data.

## Resetting local infrastructure

`npm run db:down` stops the local containers and preserves the PostgreSQL volume. Deleting that volume destroys local data and therefore is intentionally not part of the routine instructions.
