-- Atomic trial invoice increment with race-condition protection.
-- Returns the new count on success, or -1 if the limit is already reached
-- (or the user is not a trial user).
--
-- IMPORTANT: The limit (10) must match TRIAL_INVOICE_LIMIT in lib/billing/tiers.ts.
CREATE OR REPLACE FUNCTION increment_trial_invoice(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE users
  SET trial_invoices_used = trial_invoices_used + 1
  WHERE id = p_user_id
    AND NOT is_design_partner
    AND subscription_status != 'active'
    AND trial_invoices_used < 10
  RETURNING trial_invoices_used INTO new_count;

  RETURN COALESCE(new_count, -1);
END;
$$;
