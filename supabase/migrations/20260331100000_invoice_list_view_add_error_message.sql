-- Add error_message to the flattened invoice list view
-- so error rows can display the reason in the invoice list UI.
-- DROP required because adding a column in the middle changes column order,
-- which CREATE OR REPLACE cannot handle.

DROP VIEW IF EXISTS invoice_list_view;

CREATE VIEW invoice_list_view WITH (security_invoker = true) AS
SELECT
  i.id,
  i.org_id,
  i.file_name,
  i.status,
  i.uploaded_at,
  i.output_type,
  i.batch_id,
  i.source,
  i.email_sender,
  i.error_message,
  ed.vendor_name,
  ed.invoice_number,
  ed.invoice_date,
  ed.total_amount
FROM invoices i
LEFT JOIN extracted_data ed ON ed.invoice_id = i.id;
