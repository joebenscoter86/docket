export type InvoiceStatus =
  | "uploading"
  | "extracting"
  | "pending_review"
  | "approved"
  | "synced"
  | "error";

export interface ExtractedLineItemRow {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  sort_order: number;
}

export interface ExtractedDataRow {
  id: string;
  invoice_id: string;
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_ref: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  confidence_score: "high" | "medium" | "low" | null;
  raw_ai_response: unknown;
  model_version: string | null;
  extraction_duration_ms: number | null;
  extracted_at: string;
  extracted_line_items: ExtractedLineItemRow[];
}
