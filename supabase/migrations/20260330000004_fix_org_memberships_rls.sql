-- Fix: org_memberships SELECT policy had circular self-reference.
-- The subquery on org_memberships was itself subject to RLS, causing infinite
-- recursion and returning empty results. Use users.active_org_id instead.

DROP POLICY IF EXISTS "org_memberships_org_read" ON org_memberships;

CREATE POLICY "org_memberships_org_read" ON org_memberships
  FOR SELECT
  USING (
    org_id IN (
      SELECT u.active_org_id FROM users u WHERE u.id = auth.uid()
    )
  );
