-- Add output type columns for Bill-to-Check Toggle (DOC-82)
-- Supports Bill, Check, Cash Expense, and Credit Card transaction types

-- invoices table: per-invoice output type + payment account
ALTER TABLE invoices
  ADD COLUMN output_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN payment_account_id TEXT,
  ADD COLUMN payment_account_name TEXT;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_output_type_check
  CHECK (output_type IN ('bill', 'check', 'cash', 'credit_card'));

-- organizations table: org-wide defaults
ALTER TABLE organizations
  ADD COLUMN default_output_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN default_payment_account_id TEXT,
  ADD COLUMN default_payment_account_name TEXT;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_output_type_check
  CHECK (default_output_type IN ('bill', 'check', 'cash', 'credit_card'));

-- sync_log table: track transaction type per sync
ALTER TABLE sync_log
  ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN provider_entity_type TEXT NOT NULL DEFAULT 'Bill';

ALTER TABLE sync_log
  ADD CONSTRAINT sync_log_transaction_type_check
  CHECK (transaction_type IN ('bill', 'check', 'cash', 'credit_card'));

-- Backfill existing sync_log rows
UPDATE sync_log SET provider_entity_type = 'Bill' WHERE provider_entity_type IS NULL;
