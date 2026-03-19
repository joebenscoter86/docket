-- Add GL suggestion columns to extracted_line_items
ALTER TABLE extracted_line_items
  ADD COLUMN suggested_gl_account_id TEXT,
  ADD COLUMN gl_suggestion_source TEXT CHECK (gl_suggestion_source IN ('ai', 'history')),
  ADD COLUMN is_user_confirmed BOOLEAN DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN extracted_line_items.suggested_gl_account_id IS 'AI or history-suggested GL account ID. Stored separately from gl_account_id — never auto-copied.';
COMMENT ON COLUMN extracted_line_items.gl_suggestion_source IS 'Source of suggestion: ai (DOC-78) or history (DOC-79). Null if no suggestion.';
COMMENT ON COLUMN extracted_line_items.is_user_confirmed IS 'True when user has explicitly selected a GL account from dropdown.';
