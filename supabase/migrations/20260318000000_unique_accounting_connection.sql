-- Migration: Add unique constraint on accounting_connections(org_id, provider)
-- Issue: DOC-49
-- Prevents duplicate QBO connection rows for the same org.
-- First, clean up any existing duplicates (keep the most recent).

DELETE FROM accounting_connections a
USING accounting_connections b
WHERE a.org_id = b.org_id
  AND a.provider = b.provider
  AND a.connected_at < b.connected_at;

ALTER TABLE accounting_connections
  ADD CONSTRAINT uq_accounting_connections_org_provider UNIQUE (org_id, provider);
