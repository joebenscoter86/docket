import { logger } from "@/lib/utils/logger";
import type {
  ExtractionResult,
  ExtractedLineItem,
  ExtractedDataRow,
  ExtractedLineItemRow,
} from "./types";

/**
 * Normalize a monetary value that may be a number, a string with currency
 * symbols/commas, or null. Returns a plain number or null.
 */
export function normalizeMonetary(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;

  // Strip currency symbols and commas
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (cleaned === "") return null;

  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Normalize a date string to ISO YYYY-MM-DD format.
 * Handles: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY, DD-MM-YYYY.
 * Returns null for unparseable values.
 */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Try MM/DD/YYYY or DD/MM/YYYY (also with dashes)
  const slashMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);

    let month: number;
    let day: number;

    if (aNum > 12) {
      // Must be DD/MM/YYYY
      day = aNum;
      month = bNum;
    } else if (bNum > 12) {
      // Must be MM/DD/YYYY
      month = aNum;
      day = bNum;
    } else {
      // Ambiguous — assume MM/DD/YYYY (US format, most common for our users)
      month = aNum;
      day = bNum;
    }

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  return null;
}

/**
 * Normalize currency code to uppercase ISO 4217. Defaults to USD.
 */
export function normalizeCurrency(value: string | null | undefined): string {
  if (!value || value.trim() === "") return "USD";
  return value.trim().toUpperCase();
}

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

/**
 * Map an ExtractionResult to a row ready for insertion into extracted_data.
 * Never throws — logs anomalies and uses safe defaults.
 */
export function mapToExtractedDataRow(
  result: ExtractionResult,
  invoiceId: string
): ExtractedDataRow {
  const { data } = result;

  let confidenceScore = data.confidenceScore;
  if (!VALID_CONFIDENCE.has(confidenceScore)) {
    logger.warn("mapper_invalid_confidence", {
      invoiceId,
      value: confidenceScore,
      status: "defaulted_to_low",
    });
    confidenceScore = "low";
  }

  return {
    invoice_id: invoiceId,
    vendor_name: data.vendorName ?? null,
    vendor_address: data.vendorAddress ?? null,
    invoice_number: data.invoiceNumber ?? null,
    invoice_date: normalizeDate(data.invoiceDate),
    due_date: normalizeDate(data.dueDate),
    subtotal: normalizeMonetary(data.subtotal),
    tax_amount: normalizeMonetary(data.taxAmount),
    total_amount: normalizeMonetary(data.totalAmount),
    currency: normalizeCurrency(data.currency),
    payment_terms: data.paymentTerms ?? null,
    raw_ai_response: result.rawResponse,
    confidence_score: confidenceScore,
    model_version: result.modelVersion,
    extraction_duration_ms: result.durationMs,
  };
}

/**
 * Map ExtractedLineItem[] to rows ready for insertion into extracted_line_items.
 * Normalizes monetary values and defaults quantity to 1 when implied.
 */
export function mapToLineItemRows(
  lineItems: ExtractedLineItem[],
  extractedDataId: string
): ExtractedLineItemRow[] {
  return lineItems.map((item, index) => {
    const unitPrice = normalizeMonetary(item.unitPrice);
    const amount = normalizeMonetary(item.amount);

    // Use normalizeMonetary for quantity defensively — the AI may return it as
    // a string (e.g., "10") despite the TypeScript type saying number | null
    let quantity = normalizeMonetary(item.quantity);
    if (quantity === null && unitPrice !== null && amount !== null) {
      quantity = 1;
    }

    return {
      extracted_data_id: extractedDataId,
      description: item.description ?? null,
      quantity,
      unit_price: unitPrice,
      amount,
      gl_account_id: null,
      sort_order: item.sortOrder ?? index,
    };
  });
}
