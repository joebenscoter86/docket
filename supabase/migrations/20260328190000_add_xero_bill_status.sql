-- Add xero_bill_status column to invoices table.
-- Controls whether Xero bills are created as DRAFT or AUTHORISED (Awaiting Payment).
-- NULL means use default (AUTHORISED) for backwards compatibility.

ALTER TABLE invoices
  ADD COLUMN xero_bill_status TEXT
  CHECK (xero_bill_status IN ('DRAFT', 'AUTHORISED'));
