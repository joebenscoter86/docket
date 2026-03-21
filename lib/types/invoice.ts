export type InvoiceStatus =
  | "uploading"
  | "uploaded"
  | "extracting"
  | "pending_review"
  | "approved"
  | "synced"
  | "error";

// ─── Output Type (Bill-to-Check Toggle) ───

export type OutputType = "bill" | "check" | "cash" | "credit_card";
export type TransactionType = "bill" | "check" | "cash" | "credit_card";
export type ProviderEntityType = "Bill" | "Purchase";

/** Map output_type → QBO PaymentType for Purchase endpoint */
export const OUTPUT_TYPE_TO_PAYMENT_TYPE: Record<Exclude<OutputType, "bill">, string> = {
  check: "Check",
  cash: "Cash",
  credit_card: "CreditCard",
};

/** Map output_type → required QBO account type for payment account selector */
export const OUTPUT_TYPE_TO_ACCOUNT_TYPE: Record<Exclude<OutputType, "bill">, "Bank" | "CreditCard"> = {
  check: "Bank",
  cash: "Bank",
  credit_card: "CreditCard",
};

/** Display labels for the output type dropdown */
export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  bill: "Create Bill",
  check: "Write Check",
  cash: "Record Expense",
  credit_card: "Credit Card",
};

/** Helper text shown below output type dropdown */
export const OUTPUT_TYPE_HELPER_TEXT: Record<Exclude<OutputType, "bill">, string> = {
  check: "Records as a direct check payment from your bank account.",
  cash: "Records as a cash expense from your bank account.",
  credit_card: "Records as a credit card charge.",
};

/** Sync success messages per output type */
export const SYNC_SUCCESS_MESSAGES: Record<OutputType, string> = {
  bill: "Bill created in QuickBooks",
  check: "Check created in QuickBooks",
  cash: "Expense recorded in QuickBooks",
  credit_card: "Credit card expense recorded in QuickBooks",
};

/** Short labels for transaction type display in invoice list */
export const TRANSACTION_TYPE_SHORT_LABELS: Record<TransactionType, string> = {
  bill: "Bill",
  check: "Check",
  cash: "Expense",
  credit_card: "CC",
};

export interface ExtractedLineItemRow {
  id: string;
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

// ─── Duplicate Detection ───

export interface DuplicateMatch {
  invoiceId: string;
  fileName: string;
  status: string;
  matchType: "exact" | "likely";
  vendorName: string;
  invoiceNumber: string | null;
  totalAmount: number | null;
  invoiceDate: string | null;
}

export interface DuplicateWarning {
  type: "file_hash";
  message: string;
  matches: {
    invoiceId: string;
    fileName: string;
    status: string;
    uploadedAt: string;
  }[];
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
  duplicate_matches: DuplicateMatch[] | null;
}
