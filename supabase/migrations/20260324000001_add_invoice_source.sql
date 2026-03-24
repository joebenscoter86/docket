-- Migration: Add source tracking to invoices
-- Issue: DOC-65 (EML-4)

-- Source column with CHECK constraint
ALTER TABLE invoices
  ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'email', 'api'));

-- Email metadata columns (nullable, only populated for source='email')
ALTER TABLE invoices
  ADD COLUMN email_sender TEXT,
  ADD COLUMN email_subject TEXT;

-- Index for filtering by source
CREATE INDEX idx_invoices_source ON invoices(source);
