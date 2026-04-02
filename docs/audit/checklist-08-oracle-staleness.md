# Audit Checklist #8 — Oracle Manipulation / Price Staleness / HYPERP Oracle Integrity

**Date:** 2026-04-01  
**Auditor:** Sentinel (security agent)  
**Scope:** `percolator-prog/src/percolator.rs` oracle paths, `percolator-launch/app/hooks/useTrade.ts`, `/api/prices/` routes  
**Severity ratings:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Summary

**Result: 1 LOW, 1 INFO — No critical or high findings. Oracle security is well-designed.**

---

## Reviewed Areas

### 1. Pyth Pull Oracle — Staleness + Confidence (percolator.rs)

**Status: PASS**

- `read_pyth_price_e6` checks `age < 0 || age as u64 > max_staleness_secs` → returns `OracleStalePriceFeed`
- Confidence check: `conf * 10000 > price_u * conf_bps` → returns `OraclePriceConfidenceTooHigh`
- Both checks gated `#[cfg(not(feature = "devnet"))]` — correctly skipped only on devnet
- Compile-time assertion `compile_error!("devnet feature MUST NOT be enabled on mainnet builds!")` prevents accidental mainnet build with devnet feature
- Feed ID verified against expected_feed_id before price is read

### 2. Chainlink Oracle — Staleness (percolator.rs)

**Status: PASS**

- `read_chainlink_price_e6` mirrors Pyth staleness pattern: `age < 0 || age > max_staleness_secs`
- No confidence check (by design — Chainlink doesn't expose conf intervals)

### 3. Authority Price Oracle (admin oracle mode)

**Status: PASS**

- `read_authority_price` checks `now_unix_ts - stored_timestamp > max_staleness_secs` → rejects stale admin price
- `pyth-pinned` mode (`oracle_authority == [0;32] && index_feed_id != [0;32]`) disables PushOraclePrice — prevents admin price substitution in full Pyth mode
- useTrade.ts fetches oracle price from backend (`/api/prices/markets`) not from stale DB. Fails hard (no fallback to hardcoded price) per GH#1966 fix.

### 4. HYPERP Mode (DEX Oracle via UpdateHyperpMark)

**Status: PASS — comprehensive manipulation protections in place**

- **CPI rejection**: `get_stack_height() > TRANSACTION_LEVEL_STACK_HEIGHT` → `EngineUnauthorized` — prevents sandwich attack in same TX
- **25-slot minimum update interval**: limits to ~6 cranks/min max
- **5%/crank deviation clamp**: flash-loan spike clamped, not rejected (avoids oracle wedge on real price moves)
- **0.1%/slot rate cap** (`DEFAULT_HYPERP_PRICE_CAP_E2BPS = 1000`): max drift ~6%/min even with continuous manipulation
- **MIN_DEX_QUOTE_LIQUIDITY = 2T lamports ($2k min)**: blocks thin-pool bootstrapping
- **OI cap**: `pool_depth / HYPERP_EPOCH_OI_POOL_DIVISOR (10)` — limits max manipulable notional to 10% of pool depth
- **Bootstrap guard**: `authority_price_e6 == 0` → rejected until admin seeds initial mark
- **DEX program owner check**: only PumpSwap, Raydium CLMM, Meteora DLMM accepted
- **PumpSwap base_mint cross-check**: `pool_base_mint == config.collateral_mint` — prevents wrong-pool substitution
- **Hyperp staleness**: `check_hyperp_staleness` → `OracleStale` if engine not cranked within `max_crank_staleness_slots`

### 5. Frontend Oracle Price for On-Chain Trades (useTrade.ts)

**Status: PASS**

- Admin oracle markets: fetch from `/api/prices/markets` (proxies backend `/prices/markets` — live oracle keeper data)
- Hard-abort if price fetch fails — no fallback to hardcoded price (GH#1966 fix)
- Pyth/Chainlink markets: oracle price comes from the Pyth push oracle PDA directly on-chain — no frontend price injection

### 6. `/api/prices` Route — DB Price Staleness for Display

**Status: LOW**

- `GET /api/prices` fetches from Supabase `market_stats` table with NO age filter on `updated_at`
- Could serve arbitrarily stale prices if oracle keeper goes down
- **Impact**: Display-only. Used for UI price display (`useLivePrice` hook → PositionsTable PnL, TradeForm estimated PnL). NOT used for on-chain transaction construction.
- **Risk**: User sees stale/wrong display PnL — does NOT affect actual on-chain settlement
- **Mitigating factor**: Route is blocked on mainnet (`NEXT_PUBLIC_DEFAULT_NETWORK=mainnet-beta → 403`). Devnet display issue only for now.
- **Recommendation**: Add `updated_at >= now() - interval '60 seconds'` filter to Supabase query, or display a "stale" badge when `updated_at` age > threshold.

**Severity: LOW** — display-only, devnet-scoped until mainnet DB integration is validated

### 7. `/api/prices/markets` — Price Used in Admin Oracle Trades

**Status: INFO**

- Falls back: `mark_price ?? last_price ?? index_price`
- If oracle keeper is down: may use `last_price` (indexed, potentially hours stale)
- BUT: this price goes into `PushOraclePrice` on-chain, which enforces `max_staleness_secs` validation
- The on-chain program will reject the push if timestamp is stale relative to `max_staleness_secs`
- **Risk**: Low. On-chain is the authoritative gate. Trade will fail (not silently proceed) with stale data.

**Severity: INFO** — on-chain validation backstops this

---

## Findings

| ID | Severity | Component | Description | Filed |
|----|----------|-----------|-------------|-------|
| ORA-01 | LOW | `/api/prices/route.ts` | No staleness filter on DB `updated_at` — could serve stale display prices if oracle keeper goes down | Not filed — display-only, devnet-scoped |
| ORA-02 | INFO | `/api/prices/markets` | Trade price falls back to indexed `last_price` if keeper down — on-chain staleness check backstops this | Not filed — mitigated on-chain |

---

## Conclusion

Oracle security is well-designed end-to-end:
- On-chain staleness and confidence checks are correct and properly feature-gated
- HYPERP mode has layered defences against flash-loan manipulation (CPI block, rate cap, liquidity threshold, deviation clamp, OI cap)
- Admin oracle trades fail-hard on price fetch failure — no silent mispricing
- Pyth-pinned markets cannot have admin price injected

The one LOW finding (ORA-01) is display-only and devnet-scoped. No high/critical oracle manipulation vectors found.

**Next checklist item: #9 — Liquidation edge cases (partial liq, insurance fund drain)**
