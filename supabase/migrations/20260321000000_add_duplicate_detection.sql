-- File hash for upload-time duplicate detection
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_org_file_hash ON invoices(org_id, file_hash);

-- Content match results stored on extracted_data
ALTER TABLE extracted_data ADD COLUMN IF NOT EXISTS duplicate_matches JSONB;
