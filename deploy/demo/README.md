# Synthetic demo deployment

This Compose stack is for a private Tailscale-only product preview. It is not the Production deployment.

Required untracked `.env` values:

- `DEMO_HOST` — VM Tailscale IPv4 address;
- `DEMO_TAG` — immutable source revision used as the local image tag;
- `POSTGRES_PASSWORD` — generated local database password;
- `SESSION_SECRET` — generated session secret;
- `RAW_DATA_ENCRYPTION_KEY` — base64-encoded 32-byte key.

The schema SQL is copied beside the Compose file during deployment. The demo administrator is created separately through the application CLI with its password supplied over stdin.
