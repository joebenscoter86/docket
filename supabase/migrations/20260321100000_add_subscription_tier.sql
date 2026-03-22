-- Add subscription_tier column to users table for three-tier pricing
-- Tiers: starter ($29/mo), pro ($59/mo), growth ($99/mo)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT
    CHECK (subscription_tier IN ('starter', 'pro', 'growth'));

-- Add trial_invoices_used for usage-based trial (10 invoices lifetime, not time-based)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_invoices_used INTEGER DEFAULT 0;

-- Backfill: existing active subscribers get 'growth' tier (single plan before this migration)
UPDATE users
  SET subscription_tier = 'growth'
  WHERE subscription_status = 'active'
    AND subscription_tier IS NULL;
