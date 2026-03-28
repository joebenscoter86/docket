-- Add 'archived' to the valid invoice statuses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('uploading', 'uploaded', 'extracting', 'pending_review', 'approved', 'synced', 'error', 'archived'));
