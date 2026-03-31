# Mainnet Deployment Runbook — Percolator Beta Launch

> **Version:** 1.0 — Created 2026-03-31 by coder (Forge)
> **Target launch:** April 1, 2026
> **Security gate reference:** GH#1959 — Mainnet Security Gate Checklist
> **Env var reference:** docs/MAINNET-ENV.md

---

## ⚠️ GO / NO-GO CRITERIA

**DO NOT proceed with any deployment step until all three critical blockers are resolved by Khubair:**

| # | Blocker | Action | Where |
|---|---------|--------|-------|
| C1 | Supabase `service_role` key leaked in git history | **Rotate the key** | https://supabase.com/dashboard/project/ygvbajglkrwkbjdjyhxi/settings/api → then update ALL Railway services + Vercel env vars |
| C2 | Program upgrade authority is a single keypair (`7JVQvrAf`) | **Transfer to Squads multisig** | `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <SQUADS_MULTISIG>` |
| C3 | 119/178 markets have no oracle price | **Run oracle authority migration** | `bash scripts/migrate-oracle-authority.sh` (requires 4 admin keypairs or two-step admin transfer) |

Also required before go-live:
- [ ] H1: ADL T15 QA regression — **qa agent PERC-8280** must be DONE
- [ ] H5: ClaimEpochWithdrawal Kani proof — **anchor agent PERC-8291/8333** must be merged
- [ ] PERC-8334 (adl-leaderboard alias, PR#1971) must have security sign-off

---

## PHASE 0 — Pre-flight (Khubair + devops, Day of Launch)

### 0.1 Confirm all critical blockers are resolved

```bash
# Verify upgrade authority is Squads multisig (NOT 7JVQvrAf)
solana program show <MAINNET_PROGRAM_ID> --url mainnet-beta | grep "Upgrade Authority"

# Verify Supabase key was rotated (new service_role key should not match git history)
# Login to Supabase dashboard and confirm the key was rotated after 2026-03-31

# Verify oracle migration ran
# Check market count with active oracle price in Supabase
```

### 0.2 Confirm security gate: 32 DONE items + C1+C2+C3 resolved

Reference GH#1959. All items in the ✅ DONE table must remain done. Do not deploy if any regressions.

### 0.3 Generate fresh secrets for mainnet (devops runs this — DO NOT reuse devnet values)

```bash
echo "API_AUTH_KEY=$(openssl rand -hex 32)"
echo "WS_AUTH_SECRET=$(openssl rand -hex 32)"
echo "INDEXER_API_KEY=$(openssl rand -hex 32)"
echo "HELIUS_WEBHOOK_SECRET=$(openssl rand -hex 32)"   # SAME VALUE → API + Indexer
echo "ADMIN_API_SECRET=$(openssl rand -hex 32)"
echo "KEEPER_REGISTER_SECRET=$(openssl rand -hex 32)"
```

Save these in a secure password manager. Set them in Railway and Vercel as described below.

### 0.4 Confirm Khubair has provided required secrets

| Secret | Status | Notes |
|--------|--------|-------|
| `HELIUS_MAINNET_API_KEY` | ❌ NEEDED | Paid Helius plan key for mainnet |
| `NEXT_PUBLIC_HELIUS_API_KEY` | ❌ NEEDED | Rate-limited public-safe key for frontend |
| Mainnet keeper keypair (Base58) | ❌ NEEDED | Fresh keypair, NOT devnet key |
| Mainnet crank keypair (Base58) | ❌ NEEDED | Fresh keypair, fund with 0.5+ SOL |
| Squads multisig address | ❌ NEEDED | After C2 is done |
| `NEXT_PUBLIC_PRIVY_APP_ID` | ✅ Already set | Confirm Privy is configured for mainnet |

---

## PHASE 1 — Supabase Migrations (devops applies to production)

Apply migrations in this exact order. Each must succeed before the next.

> **Supabase SQL Editor:** https://supabase.com/dashboard/project/ygvbajglkrwkbjdjyhxi/sql/new

### Migration sequence (all previously-unapplied migrations first)

```
# Verify these are applied (they should be from earlier work):
20260329170000_add_network_column_PERC8192.sql
20260329180000_add_network_column.sql
20260330000000_insert_sol_usdc_mainnet_market.sql
20260330120000_ideas_update_rls_service_role.sql

# REQUIRED — not yet applied as of 2026-03-31:
20260331050000_market_challenges_PERC8332.sql   ← PERC-8332 auth gates won't work without this
```

### Apply `20260331050000_market_challenges_PERC8332.sql`

Paste and run in Supabase SQL Editor:
```sql
-- Creates market_challenges table for nonce-based deployer wallet verification
-- Full content in: supabase/migrations/20260331050000_market_challenges_PERC8332.sql
```

**Verification:**
```sql
SELECT COUNT(*) FROM market_challenges;  -- should return 0 (empty, ready for use)
SELECT table_name FROM information_schema.tables WHERE table_name = 'market_challenges';
```

### Confirm network column filtering

Verify `markets` table has `network` column and that mainnet markets are tagged correctly:
```sql
SELECT network, COUNT(*) FROM markets GROUP BY network;
-- Expect: devnet + mainnet rows, no nulls without a default
```

---

## PHASE 2 — Railway Services — Mainnet Infrastructure

> **DO NOT reuse devnet Railway services.** Create new services for mainnet.
> Railway project: https://railway.com/project/b3815507-e4d0-4abc-9913-cbc2a6b553e3

### 2.1 Create mainnet Railway services

Create three new Railway services:
1. `percolator-api-mainnet`
2. `percolator-keeper-mainnet`
3. `percolator-indexer-mainnet`

### 2.2 Set env vars per service (reference docs/MAINNET-ENV.md for full list)

#### percolator-api-mainnet

```bash
railway variables set \
  NODE_ENV=production \
  NETWORK=mainnet \
  FORCE_MAINNET=1 \
  SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=<HELIUS_MAINNET_API_KEY>" \
  CORS_ORIGINS="https://percolatorlaunch.com,https://www.percolatorlaunch.com" \
  TRUSTED_PROXY_DEPTH=1 \
  WS_AUTH_REQUIRED=true \
  MAX_WS_CONNECTIONS=1000 \
  MAX_UNAUTH_WS_CONNECTIONS_PER_IP=5
# Secrets (set via Railway dashboard, not CLI):
# API_AUTH_KEY, WS_AUTH_SECRET, HELIUS_WEBHOOK_SECRET
# SUPABASE_URL, SUPABASE_SERVICE_KEY (rotated — see C1)
# SENTRY_DSN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
# PROGRAM_ID (set after step 2.4)
```

#### percolator-keeper-mainnet

```bash
railway variables set \
  NODE_ENV=production \
  NETWORK=mainnet \
  FORCE_MAINNET=1 \
  RPC_URL="https://mainnet.helius-rpc.com/?api-key=<HELIUS_MAINNET_API_KEY>" \
  FALLBACK_RPC_URL="https://api.mainnet-beta.solana.com" \
  KEEPER_HEALTH_PORT=8081
# Secrets (set via Railway dashboard):
# KEEPER_PRIVATE_KEY (fresh mainnet keypair, Base58)
# CRANK_KEYPAIR (fresh mainnet keypair, funded 0.5+ SOL)
# HELIUS_MAINNET_API_KEY
# KEEPER_REGISTER_SECRET
# SUPABASE_URL, SUPABASE_KEY (anon key only — NOT service role)
# PROGRAM_ID (set after step 2.4)
```

> ⚠️ **KEEPER DOES NOT GET SERVICE ROLE KEY.** Anon key only. The `networkValidation.ts` guard will exit(1) if `SUPABASE_KEY === SUPABASE_SERVICE_ROLE_KEY`.

#### percolator-indexer-mainnet

```bash
railway variables set \
  NODE_ENV=production \
  NETWORK=mainnet \
  SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=<HELIUS_MAINNET_API_KEY>" \
  INDEXER_PORT=4001
# Secrets (set via Railway dashboard):
# HELIUS_API_KEY (mainnet key)
# HELIUS_WEBHOOK_SECRET (SAME value as API service)
# SUPABASE_URL, SUPABASE_SERVICE_KEY (rotated)
# WEBHOOK_URL (set after indexer is deployed and has a public URL)
# PROGRAM_ID, ALL_PROGRAM_IDS (set after step 2.4)
```

### 2.3 Deploy services — order matters

Deploy in this sequence:

1. **Deploy percolator-api-mainnet first** — wait for health check 200
2. **Deploy percolator-indexer-mainnet** — indexer registers Helius webhook on startup
3. **Deploy percolator-keeper-mainnet** — keeper starts crank cycles last

```bash
# After each deploy, verify health:
curl -s https://percolator-api-mainnet.up.railway.app/health
curl -s https://percolator-indexer-mainnet.up.railway.app/health
curl -s https://percolator-keeper-mainnet.up.railway.app/health
```

### 2.4 Set PROGRAM_ID after anchor deploys mainnet program

> **Note:** The mainnet program ID in docs/DEPLOYMENT.md is `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24`. Confirm with anchor agent that this is the final deployed ID.

```bash
# Set on all three services:
PROGRAM_ID=<mainnet_program_id>
ALL_PROGRAM_IDS=<comma_separated_mainnet_program_ids>
```

---

## PHASE 3 — Vercel Frontend Deploy

### 3.1 Update env vars in Vercel production

> Vercel dashboard: https://vercel.com → percolator-launch project → Settings → Environment Variables

**Required changes (DO NOT flip until Railway services are live):**

| Variable | Current | Set to |
|----------|---------|--------|
| `NEXT_PUBLIC_DEFAULT_NETWORK` | `devnet` | `mainnet` |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `devnet` | `mainnet-beta` |
| `NEXT_PUBLIC_NETWORK` | `devnet` | `mainnet` |
| `NEXT_PUBLIC_RPC_URL` | devnet Helius | `https://mainnet.helius-rpc.com/?api-key=<PUBLIC_SAFE_KEY>` |
| `NEXT_PUBLIC_HELIUS_RPC_URL` | devnet | mainnet |
| `NEXT_PUBLIC_HELIUS_API_KEY` | devnet key | mainnet public key (rate-limited — NOT service key) |
| `NEXT_PUBLIC_API_URL` | devnet Railway URL | `https://percolator-api-mainnet.up.railway.app` (or custom domain) |
| `NEXT_PUBLIC_WS_URL` | devnet WSS | mainnet API WebSocket URL |
| `NEXT_PUBLIC_BACKEND_URL` | devnet | mainnet |
| `NEXT_PUBLIC_PROGRAM_ID` | devnet ID | mainnet program ID |
| `NEXT_PUBLIC_TEST_USDC_MINT` | devnet USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet USDC) |

**Rotate (generate new, set in Vercel Production):**
- `ADMIN_API_SECRET` — `openssl rand -hex 32`

**Confirm still set (no change needed):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same Supabase project
- `NEXT_PUBLIC_PRIVY_APP_ID` — confirm Privy configured for mainnet
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — same
- `NEXT_PUBLIC_SENTRY_DSN` — same

### 3.2 Trigger production deploy

```bash
# Vercel auto-deploys from main branch, or trigger manually:
vercel --prod
```

### 3.3 Verify Vercel deploy

```bash
curl -s -o /dev/null -w "%{http_code}" https://percolatorlaunch.com
# Expected: 200
```

---

## PHASE 4 — Program Upgrade Authority Verification (Khubair)

**This is C2 from the critical blockers.** Must be done before any mainnet traffic.

```bash
# Transfer to Squads multisig
solana program set-upgrade-authority <MAINNET_PROGRAM_ID> \
  --new-upgrade-authority <SQUADS_MULTISIG_ADDRESS> \
  --keypair ~/.percolator-mainnet/keys/deploy-authority.json \
  --url mainnet-beta

# Verify transfer
solana program show <MAINNET_PROGRAM_ID> --url mainnet-beta | grep "Upgrade Authority"
# Must show: Upgrade Authority: <SQUADS_MULTISIG_ADDRESS>
```

---

## PHASE 5 — Oracle Authority Migration (Khubair)

**This is C3 from the critical blockers.** 119/178 markets need oracle authority migration.

```bash
bash scripts/migrate-oracle-authority.sh
```

Requires the 4 admin keypairs (or two-step admin transfer if keypairs unavailable). Coordinate with anchor agent on exact script parameters.

**Verification:**
```bash
# After migration, check market oracle status via API:
curl https://percolator-api-mainnet.up.railway.app/api/markets | jq '[.[] | select(.oracle_price == null)] | length'
# Expected: 0 (all markets have oracle price)
```

---

## PHASE 6 — Post-Deploy Smoke Tests

Run these checks in order after all services are deployed. ALL must pass before announcing beta launch.

### 6.0 Automated verification script (run first)

```bash
./scripts/verify-mainnet-deploy.sh
```

This checks all service health endpoints, /api/markets, and WebSocket connectivity in one pass. If all checks pass, proceed to manual verification below. If any fail, fix before continuing.

### 6.1 Infrastructure health

```bash
# Site health
curl -s -o /dev/null -w "%{http_code}" https://percolatorlaunch.com
# Expected: 200

# API health
curl -s https://percolator-api-mainnet.up.railway.app/health | jq '.status'
# Expected: "ok"

# Keeper health
curl -s https://percolator-keeper-mainnet.up.railway.app/health | jq '.status'
# Expected: "ok"
```

### 6.2 API endpoint verification

```bash
API="https://percolator-api-mainnet.up.railway.app"

# Markets list — should return mainnet markets only (not devnet markets)
curl -s "$API/api/markets" | jq 'length'
# Expected: >0 mainnet markets

# Markets should NOT include devnet-only test markets
curl -s "$API/api/markets" | jq '[.[] | select(.network == "devnet")] | length'
# Expected: 0

# ADL leaderboard route alias (PERC-8334)
curl -s -o /dev/null -w "%{http_code}" "$API/api/adl-leaderboard"
# Expected: 200 or 204 (not 404)

# POST /api/markets requires auth — should reject unauthenticated request
curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/markets" \
  -H "Content-Type: application/json" -d '{"test":true}'
# Expected: 401
```

### 6.3 Frontend verification

- [ ] percolatorlaunch.com loads without console errors
- [ ] Network indicator shows "mainnet" (not devnet)
- [ ] Markets list loads with real SOL/USDC + other mainnet markets
- [ ] Wallet connect works (Privy + WalletConnect)
- [ ] No devnet test tokens visible (USDC mint is mainnet EPjF...)
- [ ] Trading UI shows real oracle prices (not $1 fallback)

### 6.4 Helius webhook verification

```bash
# Check Helius dashboard for active mainnet webhook:
# https://dev.helius.xyz → Webhooks → confirm URL matches mainnet indexer Railway URL
# Webhook URL should be: https://percolator-indexer-mainnet.up.railway.app/webhook/trades
```

### 6.5 Keeper crank verification

```bash
railway logs -n 30 --service percolator-keeper-mainnet | grep -i "crank\|funded\|cycle"
# Expected: crank cycle logs, no errors
```

### 6.6 End-to-end trade test

Execute one small test trade on mainnet:
1. Connect wallet with small SOL balance
2. Open a 1 USDC long position on SOL/USDC
3. Verify trade appears in Supabase `trades` table
4. Close position
5. Verify PnL calculation is correct

---

## PHASE 7 — Sentry Monitoring Setup

Ensure Sentry is capturing mainnet errors before announcing launch.

```bash
# Verify frontend Sentry is receiving events (use SENTRY_AUTH_TOKEN from Railway/Vercel env):
curl -s "https://sentry.io/api/0/projects/dcc-pz/percolator-frontend/issues/?limit=5" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | jq '.[0].title'

# Verify backend Sentry:
curl -s "https://sentry.io/api/0/projects/dcc-pz/percolator-backend/issues/?limit=5" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | jq '.[0].title'
```

---

## ROLLBACK PROCEDURE

If the deploy fails or critical issues are found post-launch:

### Frontend rollback (instant)

```bash
# Revert Vercel to previous deployment:
vercel rollback
# Or via Vercel dashboard → Deployments → previous deployment → "Promote to Production"

# Flip network vars back to devnet:
vercel env rm NEXT_PUBLIC_DEFAULT_NETWORK production
echo "devnet" | vercel env add NEXT_PUBLIC_DEFAULT_NETWORK production
vercel --prod
```

### Backend service rollback

```bash
# Railway: redeploy previous image
# Dashboard → percolator-api-mainnet → Deployments → previous deployment → "Redeploy"
# Or if service is broken, restart devnet service as temp fallback:
railway service restart --service percolator-api1
```

### Database rollback (CAUTION — requires Supabase)

> **Note:** Supabase migrations are generally NOT reversible without data loss risk.
> 
> For the `market_challenges` table (PERC-8332): this table is append-only and safe to drop if needed:
> ```sql
> DROP TABLE IF EXISTS market_challenges;
> ```
> 
> For `network` column migrations: these added columns only — safe, no data lost if you need to stop using them.

### Communication on rollback

1. Message PM via Collector API immediately with rollback reason
2. Post to #coder Discord with status
3. Update SHARED-STATE.md with new status
4. Do NOT post public announcements — Khubair handles comms

---

## POST-LAUNCH MONITORING (First 24h)

Coder owns infra monitoring. Run every 30 min for first 24h after launch.

```bash
# Quick health sweep
curl -s -o /dev/null -w "Site: %{http_code}\n" https://percolatorlaunch.com
railway logs -n 20 --service percolator-api-mainnet 2>/dev/null | grep -i "error\|fatal\|crash" | head -5
railway logs -n 20 --service percolator-keeper-mainnet 2>/dev/null | grep -i "error\|fatal\|crash" | head -5

# CI check
gh run list -R dcccrypto/percolator-launch --limit 3 --json status,conclusion,name \
  --jq '.[] | select(.conclusion == "failure")'
```

Alert thresholds:
- Site returns non-200 → redeploy immediately, message PM
- Keeper stops cranking for >5 min → restart service, investigate
- API errors >10/min in Sentry → page Khubair via Discord DM
- Database connection failures → check Supabase dashboard, restart services

---

## RESPONSIBLE PARTIES

| Step | Owner |
|------|-------|
| C1: Rotate Supabase key | Khubair |
| C2: Squads multisig transfer | Khubair |
| C3: Oracle authority migration | Khubair + anchor agent |
| Phase 0: Pre-flight | Khubair + devops |
| Phase 1: Supabase migrations | devops |
| Phase 2: Railway mainnet infra | devops + coder |
| Phase 3: Vercel deploy | coder + devops |
| Phase 4: Program authority | Khubair |
| Phase 5: Oracle migration | Khubair |
| Phase 6: Smoke tests | coder + qa |
| Phase 7: Sentry | coder |
| Rollback decision | Khubair |

---

*Runbook created by coder (Forge) for PERC-8336. Apr 1 2026 beta launch.*
*Reference: GH#1959 security checklist, docs/MAINNET-ENV.md, docs/mainnet-readiness-checklist.md*
