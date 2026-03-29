-- Add tax_treatment column to invoices table.
-- Controls how line item amounts are interpreted for tax purposes when syncing.
-- Provider-agnostic values: exclusive, inclusive, no_tax.
-- NULL means use default (exclusive).

ALTER TABLE invoices
  ADD COLUMN tax_treatment TEXT
  CHECK (tax_treatment IN ('exclusive', 'inclusive', 'no_tax'));
