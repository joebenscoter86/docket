-- Migration: Add active_org_id to users table for multi-org support
-- Allows users to belong to multiple orgs while API routes resolve a single active org.
-- Backfills existing users from their current org_membership.

-- Step 1: Add column as nullable first (backfill needed)
ALTER TABLE public.users
  ADD COLUMN active_org_id UUID REFERENCES public.organizations(id);

-- Step 2: Backfill from existing org_memberships (each user has exactly one)
UPDATE public.users u
SET active_org_id = (
  SELECT om.org_id
  FROM public.org_memberships om
  WHERE om.user_id = u.id
  ORDER BY om.created_at ASC
  LIMIT 1
);

-- Note: Column stays nullable to avoid chicken-and-egg FK issue in the signup trigger
-- (organizations.owner_id references users.id, so user must be created before org).
-- In practice, active_org_id is always set: backfill covers existing users,
-- trigger sets it for new users within the same transaction.

-- Index for joins
CREATE INDEX idx_users_active_org_id ON public.users(active_org_id);
