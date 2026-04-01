-- Add org-level default tax code to accounting connections.
-- Stores the provider tax code ID (QBO TaxCode Id or Xero TaxType string).
-- Null = no default (current behavior).

ALTER TABLE accounting_connections
  ADD COLUMN default_tax_code_id TEXT;

COMMENT ON COLUMN accounting_connections.default_tax_code_id IS 'Default tax code applied to new line items during extraction. QBO: TaxCode Id. Xero: TaxType string. Null = no default.';
