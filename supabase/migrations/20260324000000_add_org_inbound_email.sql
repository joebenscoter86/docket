-- Migration: Add inbound email address to organizations
-- Issue: DOC-63 (EML-2)

ALTER TABLE organizations
  ADD COLUMN inbound_email_address TEXT UNIQUE;

-- No RLS change needed: organizations table already has RLS via org_memberships.
-- The new column inherits the existing policy.
