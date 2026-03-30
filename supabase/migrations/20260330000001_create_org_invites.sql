-- Migration: Create org_invites table for team invite flow
-- Stores pending and accepted invitations to join an organization.

CREATE TABLE public.org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'owner')),
  invited_by UUID NOT NULL REFERENCES public.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Token lookup for invite acceptance page
CREATE INDEX idx_org_invites_token ON public.org_invites(token);

-- List pending invites per org
CREATE INDEX idx_org_invites_org_id ON public.org_invites(org_id);

-- Prevent duplicate pending invites to same email for same org
CREATE UNIQUE INDEX idx_org_invites_unique_pending
  ON public.org_invites(org_id, lower(invited_email))
  WHERE accepted_at IS NULL;

-- RLS
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Org members can read invites for their org
CREATE POLICY "org_invites_org_read" ON public.org_invites
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- Only owners can insert/update/delete invites (enforced in API, but RLS as safety net)
CREATE POLICY "org_invites_org_write" ON public.org_invites
  FOR ALL
  USING (
    org_id IN (
      SELECT om.org_id FROM org_memberships om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
  );
