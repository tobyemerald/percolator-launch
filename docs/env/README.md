# Mainnet Environment Variable Templates

Each file lists the required environment variables for one mainnet service.

| File | Railway Service | Vercel |
|------|----------------|--------|
| `api.env.mainnet.example` | `percolator-api-mainnet` | — |
| `keeper.env.mainnet.example` | `oracle-keeper-mainnet` / `percolator-keeper-mainnet` | — |
| `indexer.env.mainnet.example` | `percolator-indexer-mainnet` | — |
| `frontend.env.mainnet.example` | — | `percolatorlaunch.com` |

## Usage

1. Copy the relevant `.example` file to the exact filename the deploy script expects:
   - `api.env.mainnet.example` → `.env.mainnet.api` (required by deploy-mainnet-railway.sh)
   - `keeper.env.mainnet.example` → `.env.mainnet.keeper`
   - `indexer.env.mainnet.example` → `.env.mainnet.indexer`
2. Fill in all `<PLACEHOLDER>` values
3. Set via Railway CLI (`railway variables set KEY=value --service <name>`) or dashboard
4. For frontend: set in Vercel dashboard → Settings → Environment Variables

## Critical Prerequisites

- **Supabase service_role key must be rotated** before setting on any service (leaked in git history)
- **Keeper only gets the anon key** — the env guard will crash the service if it detects a service_role key
- **Generate fresh secrets** for `API_AUTH_KEY`, `WS_AUTH_SECRET`, `INTERNAL_API_SECRET` — do not reuse devnet values

## Deploy Script

```bash
./scripts/deploy-mainnet-railway.sh --dry-run        # preview
./scripts/deploy-mainnet-railway.sh --service api     # deploy API only
./scripts/deploy-mainnet-railway.sh                   # deploy all
```
