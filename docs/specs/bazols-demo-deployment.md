# Bazols synthetic server demo

**Status:** approved for an internal Tailscale-only preview; not Production.

## Purpose

Run the merged reporting MVP on the existing Bazols VM so the owner can inspect the UI and complete a manual sync without supplying real source credentials.

## Acceptance criteria

- Build API, web, and fake-source images from the current repository revision.
- Run PostgreSQL, API, worker, synthetic source, and web gateway in an isolated `bazols-demo` Compose project.
- Bind the web gateway only to the VM Tailscale address on port `8080`.
- Keep PostgreSQL, API, worker, and fake source unexposed to host ports.
- Initialize the schema and create one local demo administrator without printing its password.
- Verify Compose health, `/health/live`, `/health/ready`, login, source discovery, restaurant creation, sync completion, and both reports.
- Do not activate or modify `/opt/bazols/*.pending`, DNS, NAS proxy, firewall, real source credentials, or Production delivery.

## Rollback

Run `docker compose down` from the server demo directory. Add `--volumes` only when the owner explicitly requests deletion of demo data.

## Boundary

This deployment deliberately uses synthetic fixtures and `NODE_ENV=test` to support HTTP over the private tailnet. It is not evidence of Production readiness. Production remains tracked by GitHub issue #25.
