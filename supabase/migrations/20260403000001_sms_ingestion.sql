-- Migration: SMS/MMS ingestion support
-- Issue: DOC-141

-- 1. Add phone_number to users table
ALTER TABLE users
  ADD COLUMN phone_number TEXT UNIQUE;

CREATE INDEX idx_users_phone_number ON users(phone_number);

-- 2. Update invoices source constraint to include 'sms'
-- Drop the old constraint and add the new one
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_source_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_source_check
    CHECK (source IN ('upload', 'email', 'sms', 'api'));

-- 3. Add sms_body_context column to invoices
ALTER TABLE invoices
  ADD COLUMN sms_body_context TEXT;

-- 4. Create sms_verification_codes table
CREATE TABLE sms_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sms_verification_codes_user_id ON sms_verification_codes(user_id);

ALTER TABLE sms_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_verification_codes_self_access" ON sms_verification_codes
  FOR ALL
  USING (user_id = auth.uid());

-- 5. Create sms_ingestion_log table
CREATE TABLE sms_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  from_number TEXT NOT NULL,
  num_media INTEGER DEFAULT 0,
  body_text TEXT,
  total_attachment_count INTEGER DEFAULT 0,
  valid_attachment_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected', 'rate_limited')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sms_ingestion_log_org_id ON sms_ingestion_log(org_id);
CREATE INDEX idx_sms_ingestion_log_from_number_created_at ON sms_ingestion_log(from_number, created_at);

ALTER TABLE sms_ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_ingestion_log_org_access" ON sms_ingestion_log
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- 6. Recreate invoice_list_view to include sms_body_context
-- DROP required because adding a column changes column order
DROP VIEW IF EXISTS invoice_list_view;

CREATE VIEW invoice_list_view WITH (security_invoker = true) AS
SELECT
  i.id, i.org_id, i.file_name, i.status, i.uploaded_at, i.output_type,
  i.batch_id, i.source, i.email_sender, i.error_message, i.sms_body_context,
  ed.vendor_name, ed.invoice_number, ed.invoice_date, ed.total_amount
FROM invoices i
LEFT JOIN extracted_data ed ON ed.invoice_id = i.id;
