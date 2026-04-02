-- Migration 20260402171000: Add status column to markets table
--
-- Allows indexer to mark markets as 'active', 'closed', etc.
-- The markets_with_stats view (rebuilt in 20260402170000) already filters
-- indexer_excluded. This status column gives a more semantic way to track
-- market lifecycle. Frontend and API can filter on status='active'.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'paused'));

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);

COMMENT ON COLUMN markets.status IS 'Market lifecycle status: active (trading), closed (decommissioned), paused (temporarily halted)';

-- Update the view to also exclude closed markets
DROP VIEW IF EXISTS markets_with_stats;

CREATE VIEW markets_with_stats AS
SELECT
  m.*,
  s.last_price,
  s.mark_price,
  s.index_price,
  s.volume_24h,
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
  s.liquidation_buffer_bps,
  s.trade_count_24h,
  s.updated_at AS stats_updated_at
FROM markets m
LEFT JOIN market_stats s ON m.slab_address = s.slab_address
WHERE COALESCE(m.indexer_excluded, false) = false
  AND m.status != 'closed';

COMMENT ON VIEW markets_with_stats IS 'Combined view of markets with stats. Excludes indexer_excluded and closed markets. Filter by network column for isolation.';

-- Mark old NV2b slab as closed
UPDATE markets SET status = 'closed' WHERE slab_address = 'NV2bDFWrp3kgZjkjBpwZq2jGThjbHMXcyDbdVduGSbq';

NOTIFY pgrst, 'reload schema';
