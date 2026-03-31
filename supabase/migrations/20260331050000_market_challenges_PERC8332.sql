-- PERC-8332: market_challenges table for nonce-based deployer wallet verification
--
-- Stores short-lived nonces issued by GET /api/markets/challenge.
-- A valid nonce+signature pair is required before /api/markets POST accepts a registration.
-- Each nonce is single-use and expires after 5 minutes.
--
-- Cleanup: expired rows are pruned lazily on each GET (handled in route code).
-- Optional: add a pg_cron job to purge old rows periodically if volume grows.

CREATE TABLE IF NOT EXISTS market_challenges (
  nonce       TEXT        PRIMARY KEY,
  deployer    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  client_ip   TEXT
);

-- Index for fast expiry lookups
CREATE INDEX IF NOT EXISTS market_challenges_expires_at_idx ON market_challenges (expires_at);
-- Index for deployer lookups (rate-limit check: max N pending challenges per deployer)
CREATE INDEX IF NOT EXISTS market_challenges_deployer_idx ON market_challenges (deployer);

-- RLS: only service role can read/write (anon cannot enumerate pending challenges)
ALTER TABLE market_challenges ENABLE ROW LEVEL SECURITY;
-- No permissive policies → all access via service role key only

COMMENT ON TABLE market_challenges IS
  'PERC-8332: Short-lived nonces for deployer wallet-sig verification before market registration. '
  'TTL=5min, single-use. Pruned lazily in route.ts.';
