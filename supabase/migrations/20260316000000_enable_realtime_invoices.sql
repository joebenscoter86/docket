-- Enable Supabase Realtime on the invoices table
-- Required for DOC-17: realtime status updates during extraction

ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
