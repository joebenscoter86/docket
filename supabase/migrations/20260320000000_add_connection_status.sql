-- Add connection health status and refresh token expiry tracking.
-- Existing QBO rows get status='active' (Postgres backfills DEFAULT on NOT NULL ADD COLUMN).
-- refresh_token_expires_at is nullable so existing rows are unaffected.

ALTER TABLE accounting_connections
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'expired', 'error'));

ALTER TABLE accounting_connections
  ADD COLUMN refresh_token_expires_at TIMESTAMPTZ;
