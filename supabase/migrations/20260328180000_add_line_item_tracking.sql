-- Add tracking categories support to line items (DOC-118)
-- Stores an array of {categoryId, categoryName, optionId, optionName} objects
-- Nullable: tracking is optional, not all providers support it
ALTER TABLE extracted_line_items ADD COLUMN tracking JSONB;

-- Add a comment for documentation
COMMENT ON COLUMN extracted_line_items.tracking IS 'Array of TrackingAssignment objects [{categoryId, categoryName, optionId, optionName}]. Max 2 entries (Xero limit). Null = no tracking.';
