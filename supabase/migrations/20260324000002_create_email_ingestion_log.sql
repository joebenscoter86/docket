-- Migration: Create email ingestion log for dedup, rate limiting, and audit
-- Issue: DOC-67 (EML-6)

CREATE TABLE email_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  sender TEXT,
  subject TEXT,
  total_attachment_count INTEGER DEFAULT 0,
  valid_attachment_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected', 'duplicate', 'rate_limited')),
  rejection_reason TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- Composite index for rate limit queries: WHERE org_id = $1 AND processed_at > $2
CREATE INDEX idx_email_ingestion_log_org_processed ON email_ingestion_log(org_id, processed_at);

-- RLS
ALTER TABLE email_ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_ingestion_log_org_access" ON email_ingestion_log
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
