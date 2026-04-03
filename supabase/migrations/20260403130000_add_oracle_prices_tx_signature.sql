-- Add tx_signature column to oracle_prices (required by @percolator/shared insertOraclePrice)
ALTER TABLE oracle_prices ADD COLUMN IF NOT EXISTS tx_signature TEXT;

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_oracle_prices_tx_signature ON oracle_prices(tx_signature) WHERE tx_signature IS NOT NULL;
