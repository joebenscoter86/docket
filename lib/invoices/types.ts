import { InvoiceStatus, OutputType } from "@/lib/types/invoice";

export interface InvoiceListItem {
  id: string;
  file_name: string;
  status: InvoiceStatus;
  uploaded_at: string;
  output_type: OutputType | null;
  extracted_data: {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
  } | null;
}

export interface InvoiceListCounts {
  all: number;
  pending_review: number;
  approved: number;
  synced: number;
  error: number;
}

export interface InvoiceListParams {
  status?: string;
  sort?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
  output_type?: string;
  batch_id?: string;
}

export interface InvoiceListResult {
  invoices: InvoiceListItem[];
  nextCursor: string | null;
  counts: InvoiceListCounts;
}

// Allowlists for param validation
export const VALID_STATUSES = ["all", "pending_review", "approved", "synced", "error"] as const;
export const VALID_SORTS = ["uploaded_at", "invoice_date", "vendor_name", "total_amount"] as const;
export const VALID_DIRECTIONS = ["asc", "desc"] as const;
export const VALID_OUTPUT_TYPES = ["bill", "check", "cash", "credit_card"] as const;

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
