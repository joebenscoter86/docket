-- Add per-line-item tax code support
-- Stores the provider tax code ID selected by the user (QBO TaxCodeRef value or Xero TaxType string).
-- Null = use provider default behavior (no tax code sent on sync).

ALTER TABLE extracted_line_items
  ADD COLUMN tax_code_id TEXT;

COMMENT ON COLUMN extracted_line_items.tax_code_id IS 'Provider tax code ID. QBO: TaxCode Id (e.g., "TAX", "NON", "3"). Xero: TaxType string (e.g., "INPUT", "NONE", "TAX001"). Null = provider default.';
