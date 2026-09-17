# Manual synchronization runbook

## Start a run

1. Confirm that both the API and worker processes are running.
2. Sign in as an `ADMIN` and open **Синхронизация**.
3. If the restaurant is not listed, choose **Добавить ресторан** and map a unit and role returned by source discovery. Do not guess source IDs or roles.
4. Select the restaurant and an inclusive date range. Future end dates and reversed ranges are rejected.
5. Choose **Запустить синхронизацию** once. Bazols prevents a second active run for the same restaurant.
6. Follow the run in **Журнал запусков**:
   - `В очереди` — accepted by the API;
   - `Выполняется` — claimed by the worker;
   - `Завершена` — normalized sales and available AutoCost snapshots committed atomically;
   - `Ошибка` — previous successful reporting data remains active.
7. After success, open **Рейтинги**. The screen polls an active synchronization and refreshes reports after completion.

## Safe failure triage

Use the journal's safe error code and correlation ID. Never paste source response bodies, cookies, credentials, encrypted snapshots, employee/customer PII, or `.env` content into an issue or chat.

Common categories:

- `SOURCE_AUTH_FAILED`: verify the source account outside logs and restart API/worker after correcting `.env`.
- `SOURCE_PERMISSION_DENIED`: rediscover units/roles and check that the mapped read-only role is still granted.
- `SOURCE_CONTRACT_INVALID`: source schema changed; preserve the failed run and investigate the encrypted raw snapshot through an approved offline procedure.
- `SOURCE_TRANSPORT_FAILED`: check DNS, TLS, network reachability and source availability.
- `SYNC_STALE_RECOVERED`: a previous worker stopped; confirm there is one healthy worker before retrying.

A failed import must not replace the last successful report. If the UI shows a failure warning with older rankings, that is the intended fallback.

An empty successful AutoCost response means cost is unknown; it is not converted to zero. The current UI does not display cost or margin. Use the run's product/material cost counters only as operational evidence that snapshots were imported.

## Retry rules

- Correct the underlying configuration or source problem first.
- Start a new run for the same restaurant/date range; do not edit old run records.
- Do not make direct database changes to force a status.
- If a run remains `В очереди`, verify the separate worker process.
- If it remains `Выполняется`, inspect worker health and use correlation-safe logs. Stale recovery is handled by the worker; do not delete the run.

## Manager access check

After a successful import, verify with a manager account that:

- only assigned restaurants appear;
- `/admin/users` and `/admin/sync` redirect to rankings;
- admin navigation is absent;
- report API requests for unassigned restaurant IDs return `403` without rows.
