-- Migration 20260402170000: Exclude indexer_excluded markets from markets_with_stats
--
-- Context: Old NV2b slab was marked indexer_excluded=true in Supabase but still
-- appeared in the frontend because markets_with_stats view didn't filter it.
--
-- This rebuilds the view with a WHERE clause filtering out indexer_excluded markets.
-- To hide a decommissioned/closed slab market, set indexer_excluded=true in Supabase.

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
  -- Hidden features (migration 007)
  s.total_open_interest,
  s.net_lp_pos,
  s.lp_sum_abs,
  s.lp_max_abs,
  s.insurance_balance,
  s.insurance_fee_revenue,
  s.warmup_period_slots,
  -- Complete RiskEngine fields (migration 010)
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
  -- trade_count_24h (migration 20260314010000)
  s.trade_count_24h,
  s.updated_at AS stats_updated_at
FROM markets m
LEFT JOIN market_stats s ON m.slab_address = s.slab_address
WHERE COALESCE(m.indexer_excluded, false) = false;

COMMENT ON VIEW markets_with_stats IS 'Combined view of markets with their latest stats. Excludes indexer_excluded markets. Callers MUST filter by network column to avoid cross-network data mixing.';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
