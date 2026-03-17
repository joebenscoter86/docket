-- Add vendor_ref column to extracted_data for QBO vendor mapping
-- This stores the QBO Vendor ID (string) selected by the user during review
ALTER TABLE extracted_data ADD COLUMN IF NOT EXISTS vendor_ref TEXT;

-- Add company_name to accounting_connections for display in Settings UI
ALTER TABLE accounting_connections ADD COLUMN IF NOT EXISTS company_name TEXT;
