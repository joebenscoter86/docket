-- GL Account Mappings: stores vendor+description → GL account learned mappings
CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  vendor_name TEXT NOT NULL,
  description_pattern TEXT NOT NULL,
  gl_account_id TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, vendor_name, description_pattern)
);

CREATE INDEX idx_gl_account_mappings_org_vendor
  ON gl_account_mappings(org_id, vendor_name);

ALTER TABLE gl_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_account_mappings_org_access" ON gl_account_mappings
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- SQL function for upsert with usage_count increment
-- (Supabase JS upsert can't do `usage_count + 1` in ON CONFLICT update)
CREATE OR REPLACE FUNCTION upsert_gl_mapping(
  p_org_id UUID,
  p_vendor_name TEXT,
  p_description_pattern TEXT,
  p_gl_account_id TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO gl_account_mappings (org_id, vendor_name, description_pattern, gl_account_id, usage_count, last_used_at)
  VALUES (p_org_id, p_vendor_name, p_description_pattern, p_gl_account_id, 1, now())
  ON CONFLICT (org_id, vendor_name, description_pattern)
  DO UPDATE SET
    gl_account_id = EXCLUDED.gl_account_id,
    usage_count = gl_account_mappings.usage_count + 1,
    last_used_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
