export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
  suggestedGlAccountId: string | null;
}

export interface ExtractedInvoice {
  vendorName: string | null;
  vendorAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  paymentTerms: string | null;
  confidenceScore: "high" | "medium" | "low";
  lineItems: ExtractedLineItem[];
}

export interface ExtractionResult {
  data: ExtractedInvoice;
  rawResponse: Record<string, unknown>;
  modelVersion: string;
  durationMs: number;
}

export interface ExtractionContext {
  accounts?: Array<{ id: string; name: string }>;
}

export interface ExtractionProvider {
  extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string,
    context?: ExtractionContext
  ): Promise<ExtractionResult>;
}

/** Shape of a row inserted into the extracted_data table */
export interface ExtractedDataRow {
  invoice_id: string;
  vendor_name: string | null;
  vendor_address: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string;
  payment_terms: string | null;
  raw_ai_response: Record<string, unknown>;
  confidence_score: "high" | "medium" | "low";
  model_version: string;
  extraction_duration_ms: number;
}

/** Shape of a row inserted into the extracted_line_items table */
export interface ExtractedLineItemRow {
  extracted_data_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  sort_order: number;
  suggested_gl_account_id: string | null;
  gl_suggestion_source: string | null;
  is_user_confirmed: boolean;
}
