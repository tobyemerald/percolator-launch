# MAINNET-CHECKLIST.md — Percolator Launch Go-Live

> **Last updated:** 2026-03-30 by coder (Forge)
> **Purpose:** Single-page checklist for mainnet launch. Khubair fills in secrets; coder/devops handles infra scaffold.
> **Full env var reference:** `docs/MAINNET-ENV.md`

---

## 🔴 CRITICAL — Blockers (Khubair action required NOW)

- [ ] **Rotate Supabase `service_role` key** (PERC-8232)
  - 7 weeks exposed in git history — full DB read/write risk
  - Go to: https://supabase.com/dashboard/project/ygvbajglkrwkbjdjyhxi/settings/api → Regenerate
  - Then update `SUPABASE_SERVICE_ROLE_KEY` in Vercel + all Railway services
  - **DO NOT launch mainnet until this is done**

- [ ] **Apply Supabase migration** (PERC-8215)
  - File: `supabase/migrations/20260329180000_add_network_column.sql`
  - Go to: https://supabase.com/dashboard/project/ygvbajglkrwkbjdjyhxi/sql/new → paste + run
  - Unblocks `/api/stats` and `/api/trader/:wallet/trades`

- [ ] **Fund FF7K wallet with ~4.2 SOL** (PERC-8172)
  - 119/178 markets have no oracle price; migration script needs this wallet funded
  - Use https://faucet.solana.com (GitHub auth) for devnet SOL
  - After funded: message devops agent to run oracle authority migration

- [ ] **Set up Squads multisig for mainnet upgrade authority** (PERC-8168)
  - Mainnet upgrade authority is single EOA (7JVQvr) — critical security risk
  - Coordinate with security agent

---

## 🟡 KHUBAIR SECRETS (fill in before mainnet services launch)

These must be provided securely (DM devops agent / paste into Railway dashboard directly):

| Secret | Description |
|--------|-------------|
| `HELIUS_MAINNET_API_KEY` | Paid Helius mainnet key — from dev.helius.xyz |
| `NEXT_PUBLIC_HELIUS_API_KEY` | Public-safe mainnet Helius key for frontend |
| `CRANK_KEYPAIR` | Fresh mainnet keypair, base58 — fund with 0.5+ SOL after providing |
| `KEEPER_PRIVATE_KEY` | Fresh mainnet keypair, base58 — NEVER reuse devnet key |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Confirm Privy app is configured for mainnet |
| `PROGRAM_ID` | Mainnet program ID — set by anchor agent after deploy |
| `ALL_PROGRAM_IDS` | All mainnet program tier IDs (comma-sep) — set after deploy |

---

## 🟢 CODER/DEVOPS OWNED (scaffold + generate)

### Generate new secrets (run locally, paste into Railway)
```bash
# These six values — generate fresh, do NOT reuse devnet values:
openssl rand -hex 32   # API_AUTH_KEY
openssl rand -hex 32   # WS_AUTH_SECRET
openssl rand -hex 32   # HELIUS_WEBHOOK_SECRET  ← SAME value in both API + Indexer
openssl rand -hex 32   # ADMIN_API_SECRET
openssl rand -hex 32   # INDEXER_API_KEY
openssl rand -hex 32   # KEEPER_REGISTER_SECRET
```

### Railway Services to Create (NEW — do not reuse devnet services)
- [ ] `percolator-api-mainnet` — copy devnet service, clear secrets, set mainnet vars
- [ ] `percolator-keeper-mainnet` — copy devnet service, clear secrets, set mainnet vars
- [ ] `percolator-indexer-mainnet` — copy devnet service, clear secrets, set mainnet vars
- [ ] All services: set `NODE_ENV=production`, `NETWORK=mainnet`, `FORCE_MAINNET=1`

### Shared Vars (safe to set without Khubair)
```
NETWORK=mainnet
FORCE_MAINNET=1
NODE_ENV=production
FALLBACK_RPC_URL=https://api.mainnet-beta.solana.com
CORS_ORIGINS=https://percolatorlaunch.com
TRUSTED_PROXY_DEPTH=1
WS_AUTH_REQUIRED=true
MAX_WS_CONNECTIONS=1000
MAX_UNAUTH_WS_CONNECTIONS_PER_IP=5
```

### Supabase (same project, confirm vars still valid after key rotation)
- [ ] `SUPABASE_URL` — confirm (same project)
- [ ] `SUPABASE_KEY` (anon key) — confirm
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — update with rotated key once Khubair rotates it
- [ ] `SUPABASE_SERVICE_KEY` (API service uses this naming) — same

### Redis (required for multi-replica mainnet API)
- [ ] Create Upstash Redis at https://console.upstash.com
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in API service

---

## 🟣 ANCHOR AGENT OWNED

- [ ] Deploy percolator program to mainnet (small/medium/large tiers)
- [ ] Record and provide mainnet program IDs
- [ ] Transfer upgrade authority to Squads multisig (coordinate with security agent)

---

## 🔵 FRONTEND (Vercel)

After all Railway services are live and URLs confirmed:

- [ ] `NEXT_PUBLIC_NETWORK=mainnet`
- [ ] `NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`
- [ ] `NEXT_PUBLIC_DEFAULT_NETWORK=mainnet`
- [ ] `NEXT_PUBLIC_RPC_URL` → mainnet Helius
- [ ] `NEXT_PUBLIC_HELIUS_RPC_URL` → mainnet Helius
- [ ] `NEXT_PUBLIC_API_URL` → mainnet Railway API URL
- [ ] `NEXT_PUBLIC_WS_URL` → mainnet Railway API WS URL
- [ ] `NEXT_PUBLIC_BACKEND_URL` → mainnet Railway API URL
- [ ] `NEXT_PUBLIC_PROGRAM_ID` → mainnet program ID
- [ ] `NEXT_PUBLIC_TEST_USDC_MINT` → `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet USDC)
- [ ] `ADMIN_API_SECRET` → rotate (generate new)

---

## ✅ LAUNCH VERIFICATION (final gate)

All items below must pass before opening percolatorlaunch.com to public:

- [ ] `curl https://percolatorlaunch.com/api/health` returns 200 + `"network":"mainnet"`
- [ ] API health check shows mainnet market count > 0
- [ ] Keeper logs: mainnet crank cycles running, no 429s
- [ ] Indexer: Helius dashboard shows active webhook pointing to mainnet indexer URL
- [ ] Frontend loads and shows mainnet markets (no devnet residue)
- [ ] Execute one test trade end-to-end on mainnet
- [ ] Sentry: no active P0 errors (check `percolator-frontend` + `percolator-backend`)
- [ ] Supabase service_role key rotated ✅
- [ ] Squads multisig upgrade authority confirmed ✅

---

## 📋 STATUS TRACKER

| Phase | Owner | Status |
|-------|-------|--------|
| Supabase key rotation | Khubair | ⏳ URGENT |
| Apply network column migration | Khubair | ⏳ URGENT |
| Fund FF7K wallet | Khubair | ⏳ |
| Squads multisig setup | Khubair + security | ⏳ |
| Generate shared secrets | coder | ⏳ (ready when Khubair DMs) |
| Create Railway mainnet services | coder | ⏳ (blocked on Helius key) |
| Deploy mainnet program | anchor | ⏳ |
| Frontend mainnet switch | coder | ⏳ (last step) |
| Launch verification | qa | ⏳ |

---

> **Full env var reference with all variable names and service-by-service breakdown:** `docs/MAINNET-ENV.md`
