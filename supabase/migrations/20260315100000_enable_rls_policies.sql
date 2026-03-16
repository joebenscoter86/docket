-- Migration: Enable RLS and create access policies on all tables
-- Issue: DOC-6 (FND-6)
-- Pattern: org_memberships join (supports Phase 3 team accounts)

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: users
-- ============================================================
-- Users can only read/update their own row.

CREATE POLICY "users_self_access" ON users
  FOR ALL
  USING (id = auth.uid());

-- ============================================================
-- POLICIES: organizations
-- ============================================================
-- Users can access orgs they belong to via org_memberships.

CREATE POLICY "organizations_member_access" ON organizations
  FOR ALL
  USING (
    id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: org_memberships
-- ============================================================
-- Users can only see their own memberships.

CREATE POLICY "org_memberships_self_access" ON org_memberships
  FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- POLICIES: accounting_connections (has org_id)
-- ============================================================

CREATE POLICY "accounting_connections_org_access" ON accounting_connections
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: invoices (has org_id)
-- ============================================================

CREATE POLICY "invoices_org_access" ON invoices
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: extracted_data (no org_id — join through invoices)
-- ============================================================

CREATE POLICY "extracted_data_org_access" ON extracted_data
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE org_id IN (
        SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- POLICIES: extracted_line_items (no org_id — join through invoices)
-- ============================================================

CREATE POLICY "extracted_line_items_org_access" ON extracted_line_items
  FOR ALL
  USING (
    extracted_data_id IN (
      SELECT id FROM extracted_data WHERE invoice_id IN (
        SELECT id FROM invoices WHERE org_id IN (
          SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- POLICIES: corrections (has org_id)
-- ============================================================

CREATE POLICY "corrections_org_access" ON corrections
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: sync_log (no org_id — join through invoices)
-- ============================================================

CREATE POLICY "sync_log_org_access" ON sync_log
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE org_id IN (
        SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
      )
    )
  );
