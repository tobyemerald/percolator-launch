-- Migration: Add network column for devnet/mainnet row isolation (PERC-8192)
--
-- Problem:
--   The same Supabase project is used for both devnet and mainnet services.
--   Without a network tag, rows from devnet and mainnet mix in every table,
--   corrupting analytics, trade history, oracle prices, and insurance data.
--
-- Solution:
--   Add network TEXT column to all tables that hold per-network data.
--   Default to 'devnet' so existing rows are cleanly labelled.
--   All services read NETWORK env var and pass it on every insert/upsert.
--   All API queries filter by network from NETWORK env var.
--
-- Tables affected:
--   markets, market_stats, trades, oracle_prices, funding_history,
--   oi_history, insurance_history, insurance_snapshots, insurance_lp_events
--
-- References: PERC-8192, docs/MAINNET-ENV.md pre-launch checklist #3

-- ── 1. markets ─────────────────────────────────────────────────────────────
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

-- Backfill existing rows (all existing rows are devnet)
UPDATE markets SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

-- The slab_address unique constraint must now be per-network so the same
-- slab address can exist on both devnet and mainnet independently.
-- Drop the old unique constraint and replace with a composite one.
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_slab_address_key;
ALTER TABLE markets
  ADD CONSTRAINT markets_slab_address_network_key UNIQUE (slab_address, network);

CREATE INDEX IF NOT EXISTS idx_markets_network ON markets (network);

-- ── 2. market_stats ────────────────────────────────────────────────────────
ALTER TABLE market_stats
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE market_stats SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

-- The slab_address unique constraint must also be per-network
ALTER TABLE market_stats DROP CONSTRAINT IF EXISTS market_stats_slab_address_key;
ALTER TABLE market_stats
  ADD CONSTRAINT market_stats_slab_address_network_key UNIQUE (slab_address, network);

CREATE INDEX IF NOT EXISTS idx_market_stats_network ON market_stats (network);

-- ── 3. trades ──────────────────────────────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE trades SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_trades_network ON trades (network);
CREATE INDEX IF NOT EXISTS idx_trades_slab_network ON trades (slab_address, network, created_at DESC);

-- ── 4. oracle_prices ───────────────────────────────────────────────────────
ALTER TABLE oracle_prices
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE oracle_prices SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_oracle_prices_network ON oracle_prices (network);
CREATE INDEX IF NOT EXISTS idx_oracle_prices_slab_network ON oracle_prices (slab_address, network, timestamp DESC);

-- ── 5. funding_history ────────────────────────────────────────────────────
ALTER TABLE funding_history
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE funding_history SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

-- Existing unique constraint is (market_slab, slot) — extend to include network
ALTER TABLE funding_history DROP CONSTRAINT IF EXISTS funding_history_market_slab_slot_key;
ALTER TABLE funding_history
  ADD CONSTRAINT funding_history_market_slab_slot_network_key UNIQUE (market_slab, slot, network);

CREATE INDEX IF NOT EXISTS idx_funding_history_network ON funding_history (network);

-- ── 6. oi_history ─────────────────────────────────────────────────────────
ALTER TABLE oi_history
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE oi_history SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_oi_history_network ON oi_history (network);

-- ── 7. insurance_history ──────────────────────────────────────────────────
ALTER TABLE insurance_history
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE insurance_history SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_insurance_history_network ON insurance_history (network);

-- ── 8. insurance_snapshots ────────────────────────────────────────────────
ALTER TABLE insurance_snapshots
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE insurance_snapshots SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_network ON insurance_snapshots (network);

-- ── 9. insurance_lp_events ────────────────────────────────────────────────
ALTER TABLE insurance_lp_events
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'devnet'
    CHECK (network IN ('devnet', 'testnet', 'mainnet'));

UPDATE insurance_lp_events SET network = 'devnet' WHERE network IS NULL OR network = 'devnet';

CREATE INDEX IF NOT EXISTS idx_insurance_lp_events_network ON insurance_lp_events (network);

-- ── 10. Rebuild markets_with_stats view to expose network ─────────────────
-- (view definition will be rebuilt by the existing view migration pattern)
CREATE OR REPLACE VIEW markets_with_stats AS
SELECT
  m.*,
  s.last_price,
  s.mark_price,
  s.index_price,
  s.price_change_24h,
  s.volume_24h,
  s.trade_count_24h,
  s.volume_total,
  s.open_interest_long,
  s.open_interest_short,
  s.insurance_fund,
  s.total_accounts,
  s.funding_rate,
  s.total_open_interest,
  s.net_lp_pos,
  s.lp_sum_abs,
  s.lp_max_abs,
  s.insurance_balance,
  s.insurance_fee_revenue,
  s.warmup_period_slots,
  s.vault_balance,
  s.lifetime_liquidations,
  s.lifetime_force_closes,
  s.c_tot,
  s.pnl_pos_tot,
  s.last_crank_slot,
  s.max_crank_staleness_slots,
  s.maintenance_fee_per_slot,
  s.liquidation_fee_bps,
  s.liquidation_fee_cap,
  s.liquidation_buffer_bps
FROM markets m
LEFT JOIN market_stats s
  ON m.slab_address = s.slab_address
  AND m.network = s.network;
