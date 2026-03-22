-- Email preferences: per-user notification toggles
CREATE TABLE email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL UNIQUE,
  extraction_notifications BOOLEAN DEFAULT true,
  sync_notifications BOOLEAN DEFAULT true,
  billing_notifications BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_preferences_user_access" ON email_preferences
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX idx_email_preferences_user_id ON email_preferences(user_id);

-- Email log: dedup + audit trail for sent emails
CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  email_address TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  resend_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Admin-only: no user-facing policy. Service role writes only.

CREATE INDEX idx_email_log_user_id ON email_log(user_id);
CREATE INDEX idx_email_log_type_user ON email_log(email_type, user_id);

-- Newsletter subscribers: marketing list (includes non-users)
CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id),
  subscribed BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'landing_page',
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts for landing page signup
CREATE POLICY "newsletter_subscribers_insert" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- Users can view/update their own subscription
CREATE POLICY "newsletter_subscribers_user_access" ON newsletter_subscribers
  FOR ALL
  USING (user_id = auth.uid());
