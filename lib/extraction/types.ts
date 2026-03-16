export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
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

export interface ExtractionProvider {
  extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<ExtractionResult>;
}
