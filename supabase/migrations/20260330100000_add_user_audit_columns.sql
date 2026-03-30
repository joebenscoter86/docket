-- Migration: Add user audit trail columns
-- Tracks which user performed each action on an invoice.

-- invoices: who uploaded and who approved
ALTER TABLE invoices
  ADD COLUMN uploaded_by UUID REFERENCES users(id),
  ADD COLUMN approved_by UUID REFERENCES users(id),
  ADD COLUMN approved_at TIMESTAMPTZ;

-- sync_log: who triggered the sync
ALTER TABLE sync_log
  ADD COLUMN synced_by UUID REFERENCES users(id);

-- corrections: who made the correction
ALTER TABLE corrections
  ADD COLUMN user_id UUID REFERENCES users(id);

-- Indexes for join performance in activity feed queries
CREATE INDEX idx_invoices_uploaded_by ON invoices(uploaded_by);
CREATE INDEX idx_sync_log_synced_by ON sync_log(synced_by);
CREATE INDEX idx_corrections_user_id ON corrections(user_id);
