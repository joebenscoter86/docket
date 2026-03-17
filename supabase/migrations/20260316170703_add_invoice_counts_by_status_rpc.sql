-- RPC function for invoice counts by status
-- Uses SECURITY DEFINER with explicit org_memberships join (bypasses RLS,
-- implements its own access control via auth.uid() for predictable aggregate queries)
CREATE OR REPLACE FUNCTION invoice_counts_by_status()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.status, count(*)::bigint
  FROM invoices i
  INNER JOIN org_memberships om ON om.org_id = i.org_id
  WHERE om.user_id = auth.uid()
  GROUP BY i.status;
$$;
