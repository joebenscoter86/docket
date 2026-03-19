-- DOC-39: Usage tracking support
-- 1. Composite index for efficient monthly invoice counting
CREATE INDEX IF NOT EXISTS idx_invoices_org_uploaded_at ON invoices(org_id, uploaded_at);

-- 2. Cache Stripe billing period on users table (avoids Stripe API call per upload)
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;
