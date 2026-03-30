-- Migration: Update org_memberships RLS to allow org-level SELECT
-- Needed for team member list: users must see all members of their org, not just themselves.
-- Write operations remain self-only (member removal uses adminClient/service role).

-- Drop existing policy that restricts all operations to self
DROP POLICY IF EXISTS "org_memberships_self_access" ON org_memberships;

-- Allow reading all memberships in orgs the user belongs to
CREATE POLICY "org_memberships_org_read" ON org_memberships
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM org_memberships om WHERE om.user_id = auth.uid()
    )
  );

-- Users can only modify their own memberships via RLS
-- (admin operations like member removal use service role client)
CREATE POLICY "org_memberships_self_write" ON org_memberships
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "org_memberships_self_update" ON org_memberships
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "org_memberships_self_delete" ON org_memberships
  FOR DELETE
  USING (user_id = auth.uid());
