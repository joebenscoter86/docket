-- Migration: Create all core tables for Docket MVP
-- Issue: DOC-3 (FND-3)
-- Schema matches CLAUDE.md Database Schema section exactly

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  is_design_partner BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE accounting_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'extracting', 'pending_review', 'approved', 'synced', 'error')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE extracted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL UNIQUE,
  vendor_name TEXT,
  vendor_address TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  subtotal NUMERIC(12,2),
  tax_amount NUMERIC(12,2),
  total_amount NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  payment_terms TEXT,
  raw_ai_response JSONB,
  confidence_score TEXT CHECK (confidence_score IN ('high', 'medium', 'low')),
  model_version TEXT,
  extraction_duration_ms INTEGER,
  extracted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE extracted_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_data_id UUID REFERENCES extracted_data(id) NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2),
  unit_price NUMERIC(12,2),
  amount NUMERIC(12,2),
  gl_account_id TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  corrected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  provider TEXT NOT NULL,
  provider_bill_id TEXT,
  request_payload JSONB,
  provider_response JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retrying'))
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships(org_id);
CREATE INDEX idx_invoices_org_id ON invoices(org_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_org_status ON invoices(org_id, status);
CREATE INDEX idx_extracted_data_invoice_id ON extracted_data(invoice_id);
CREATE INDEX idx_extracted_line_items_data_id ON extracted_line_items(extracted_data_id);
CREATE INDEX idx_corrections_invoice_id ON corrections(invoice_id);
CREATE INDEX idx_corrections_org_id ON corrections(org_id);
CREATE INDEX idx_sync_log_invoice_id ON sync_log(invoice_id);
CREATE INDEX idx_accounting_connections_org_id ON accounting_connections(org_id);

-- ============================================================
-- TRIGGER: on_auth_user_created
-- ============================================================
-- Auto-creates a users row, a default organization, and an
-- org_memberships row when a new auth user signs up.
-- Uses exception handling so auth signup succeeds even if
-- the trigger fails.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_user_id UUID;
  new_org_id UUID;
  org_name TEXT;
  email_domain TEXT;
BEGIN
  -- Extract domain from email for default org name
  email_domain := split_part(NEW.email, '@', 2);
  IF email_domain IS NOT NULL AND email_domain != '' THEN
    org_name := initcap(split_part(email_domain, '.', 1));
  ELSE
    org_name := 'My Organization';
  END IF;

  -- Create user row
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  RETURNING id INTO new_user_id;

  -- Create default organization
  INSERT INTO public.organizations (name, owner_id)
  VALUES (org_name, new_user_id)
  RETURNING id INTO new_org_id;

  -- Create org membership
  INSERT INTO public.org_memberships (user_id, org_id, role)
  VALUES (new_user_id, new_org_id, 'owner');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block auth signup
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
