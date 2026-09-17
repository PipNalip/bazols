# Bazols Backlog

## Production delivery — deferred by product owner on 2026-09-15

These items do not block local MVP implementation, tests, local Docker builds or synthetic CI. They block the first remote Production deployment and must be completed with explicit approval before activation.

- Optional future automation: review the active Tailscale policy and introduce a narrowly scoped GitHub deploy identity only if automated Production deployment is reconsidered. Current design intentionally gives GitHub no tailnet or SSH access.
- Verify the trusted operator workstation SSH key and pinned VM/jump host identities for manual deployment.
- Choose domain and DNS owner.
- Configure NAS TLS/reverse-proxy route to the private VM Caddy ingress.
- Restrict VM ingress to the NAS source through the selected firewall owner; account for Docker networking chains.
- Decide repository/GHCR public versus private visibility and provision server-local read-only GHCR access if needed.
- Enter source credentials directly on the VM; never send them through GitHub or chat.
- Select an external encrypted backup destination, retention policy and `age` recovery recipient held outside the VM.
- Run and document a successful restore rehearsal.
- Activate final Compose/Caddy/deploy/backup scripts only after application health checks exist and local delivery rehearsal passes.
- Publish the first image and deploy Production only as separate explicitly approved actions.

## Product follow-ups outside reporting MVP

- Cost/margin follow-ups: issue #36 imports restaurant-scoped product/material AutoCost history, and issue #37 uses product AutoCost for RUB-only COGS, gross margin and coverage reporting. Recipe/material attribution, historical daily backfill and multi-currency conversion remain outside the current report. Enable supply-price history only after a non-empty live contract is verified. See `docs/specs/bazols-cost-history.md` and `docs/specs/bazols-product-data-discovery.md`.
- Price changes: current menu-price endpoints are forbidden for every issued unit/role checked. Obtain least-privilege read access or select another authoritative price feed, then define the notification baseline and channel.
- Define data retention and deletion procedure.
- Add scheduling only after manual synchronization is proven reliable.
