-- Create a flattened view joining invoices with extracted_data
-- so that sorting by extracted fields (vendor_name, invoice_date, total_amount)
-- works correctly at the query level (fixes PostgREST referencedTable limitation).

CREATE OR REPLACE VIEW invoice_list_view WITH (security_invoker = true) AS
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
  ed.vendor_name,
  ed.invoice_number,
  ed.invoice_date,
  ed.total_amount
FROM invoices i
LEFT JOIN extracted_data ed ON ed.invoice_id = i.id;
