-- Add 'uploaded' status to invoice status enum and add batch_id column
-- 'uploaded' means file is in Storage, extraction hasn't started yet

-- Drop and re-add CHECK constraint to include 'uploaded'
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('uploading', 'uploaded', 'extracting', 'pending_review', 'approved', 'synced', 'error'));

-- Add batch_id column (nullable — single-file uploads have NULL)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Index for batch grouping queries
CREATE INDEX IF NOT EXISTS idx_invoices_batch_id ON invoices(batch_id);
