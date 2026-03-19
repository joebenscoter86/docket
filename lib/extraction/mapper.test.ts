import { describe, it, expect, vi } from "vitest";
import {
  mapToExtractedDataRow,
  mapToLineItemRows,
  normalizeMonetary,
  normalizeDate,
  normalizeCurrency,
} from "./mapper";
import type { ExtractionResult } from "./types";

// Mock logger
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const VALID_RESULT: ExtractionResult = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-03-01",
    dueDate: "2026-03-31",
    subtotal: 900,
    taxAmount: 90,
    totalAmount: 990,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [
      { description: "Widget A", quantity: 10, unitPrice: 90, amount: 900, sortOrder: 0, suggestedGlAccountId: null },
      { description: "Widget B", quantity: 5, unitPrice: 20, amount: 100, sortOrder: 1, suggestedGlAccountId: null },
    ],
  },
  rawResponse: { parsed: {} },
  modelVersion: "claude-sonnet-4-20250514",
  durationMs: 3800,
};

describe("normalizeMonetary", () => {
  it("passes through plain numbers", () => {
    expect(normalizeMonetary(150)).toBe(150);
  });

  it("strips dollar sign from string", () => {
    expect(normalizeMonetary("$150.00")).toBe(150);
  });

  it("strips commas from string", () => {
    expect(normalizeMonetary("1,250.50")).toBe(1250.5);
  });

  it("handles currency symbol and commas together", () => {
    expect(normalizeMonetary("$1,250.50")).toBe(1250.5);
  });

  it("returns null for null input", () => {
    expect(normalizeMonetary(null)).toBeNull();
  });

  it("returns null for unparseable string", () => {
    expect(normalizeMonetary("not a number")).toBeNull();
  });

  it("handles zero", () => {
    expect(normalizeMonetary(0)).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(normalizeMonetary(-50.25)).toBe(-50.25);
  });

  it("strips euro sign", () => {
    expect(normalizeMonetary("€250.00")).toBe(250);
  });

  it("strips pound sign", () => {
    expect(normalizeMonetary("£100")).toBe(100);
  });
});

describe("normalizeDate", () => {
  it("passes through valid ISO date", () => {
    expect(normalizeDate("2026-03-15")).toBe("2026-03-15");
  });

  it("converts MM/DD/YYYY to ISO", () => {
    expect(normalizeDate("03/15/2026")).toBe("2026-03-15");
  });

  it("converts DD/MM/YYYY with day > 12 to ISO", () => {
    expect(normalizeDate("15/03/2026")).toBe("2026-03-15");
  });

  it("returns null for null input", () => {
    expect(normalizeDate(null)).toBeNull();
  });

  it("returns null for unparseable date", () => {
    expect(normalizeDate("not a date")).toBeNull();
  });

  it("handles date with dashes like DD-MM-YYYY", () => {
    expect(normalizeDate("15-03-2026")).toBe("2026-03-15");
  });

  it("assumes US MM/DD/YYYY for ambiguous dates", () => {
    expect(normalizeDate("03/04/2026")).toBe("2026-03-04");
  });
});

describe("normalizeCurrency", () => {
  it("uppercases lowercase currency", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
  });

  it("passes through uppercase currency", () => {
    expect(normalizeCurrency("EUR")).toBe("EUR");
  });

  it("defaults to USD for null", () => {
    expect(normalizeCurrency(null)).toBe("USD");
  });

  it("defaults to USD for empty string", () => {
    expect(normalizeCurrency("")).toBe("USD");
  });
});

describe("mapToExtractedDataRow", () => {
  it("maps a valid ExtractionResult to a DB row", () => {
    const row = mapToExtractedDataRow(VALID_RESULT, "invoice-1");

    expect(row).toEqual({
      invoice_id: "invoice-1",
      vendor_name: "Acme Corp",
      vendor_address: "123 Main St",
      invoice_number: "INV-001",
      invoice_date: "2026-03-01",
      due_date: "2026-03-31",
      subtotal: 900,
      tax_amount: 90,
      total_amount: 990,
      currency: "USD",
      payment_terms: "Net 30",
      raw_ai_response: VALID_RESULT.rawResponse,
      confidence_score: "high",
      model_version: "claude-sonnet-4-20250514",
      extraction_duration_ms: 3800,
    });
  });

  it("normalizes monetary values that are strings with symbols", () => {
    const result: ExtractionResult = {
      ...VALID_RESULT,
      data: {
        ...VALID_RESULT.data,
        subtotal: "$900.00" as unknown as number,
        taxAmount: "$90.00" as unknown as number,
        totalAmount: "$990.00" as unknown as number,
      },
    };

    const row = mapToExtractedDataRow(result, "invoice-1");
    expect(row.subtotal).toBe(900);
    expect(row.tax_amount).toBe(90);
    expect(row.total_amount).toBe(990);
  });

  it("normalizes lowercase currency to uppercase", () => {
    const result: ExtractionResult = {
      ...VALID_RESULT,
      data: { ...VALID_RESULT.data, currency: "eur" },
    };

    const row = mapToExtractedDataRow(result, "invoice-1");
    expect(row.currency).toBe("EUR");
  });

  it("defaults confidence_score to low for unexpected value", () => {
    const result: ExtractionResult = {
      ...VALID_RESULT,
      data: {
        ...VALID_RESULT.data,
        confidenceScore: "very_high" as "high" | "medium" | "low",
      },
    };

    const row = mapToExtractedDataRow(result, "invoice-1");
    expect(row.confidence_score).toBe("low");
  });

  it("handles all null data fields without throwing", () => {
    const result: ExtractionResult = {
      ...VALID_RESULT,
      data: {
        vendorName: null,
        vendorAddress: null,
        invoiceNumber: null,
        invoiceDate: null,
        dueDate: null,
        subtotal: null,
        taxAmount: null,
        totalAmount: null,
        currency: "USD",
        paymentTerms: null,
        confidenceScore: "low",
        lineItems: [],
      },
    };

    const row = mapToExtractedDataRow(result, "invoice-1");
    expect(row.vendor_name).toBeNull();
    expect(row.total_amount).toBeNull();
    expect(row.invoice_date).toBeNull();
  });
});

describe("mapToLineItemRows", () => {
  it("maps line items with correct sort_order and extracted_data_id", () => {
    const rows = mapToLineItemRows(VALID_RESULT.data.lineItems, "ed-1");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      extracted_data_id: "ed-1",
      description: "Widget A",
      quantity: 10,
      unit_price: 90,
      amount: 900,
      gl_account_id: null,
      suggested_gl_account_id: null,
      gl_suggestion_source: null,
      is_user_confirmed: false,
      sort_order: 0,
    });
    expect(rows[1].sort_order).toBe(1);
  });

  it("normalizes monetary values in line items", () => {
    const items = [
      {
        description: "Service",
        quantity: 1,
        unitPrice: "$500.00" as unknown as number,
        amount: "$500.00" as unknown as number,
        sortOrder: 0,
        suggestedGlAccountId: null,
      },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].unit_price).toBe(500);
    expect(rows[0].amount).toBe(500);
  });

  it("returns empty array for empty line items", () => {
    expect(mapToLineItemRows([], "ed-1")).toEqual([]);
  });

  it("handles null fields in line items", () => {
    const items = [
      { description: null, quantity: null, unitPrice: null, amount: null, sortOrder: 0, suggestedGlAccountId: null },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].description).toBeNull();
    expect(rows[0].quantity).toBeNull();
  });

  it("defaults quantity to 1 when null but unit_price and amount are present", () => {
    const items = [
      { description: "Flat fee", quantity: null, unitPrice: 100, amount: 100, sortOrder: 0, suggestedGlAccountId: null },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].quantity).toBe(1);
  });
});

describe("GL suggestion fields", () => {
  it("maps suggestedGlAccountId to suggestion columns", () => {
    const items = [
      { description: "Consulting", quantity: 1, unitPrice: 200, amount: 200, sortOrder: 0, suggestedGlAccountId: "84" },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].suggested_gl_account_id).toBe("84");
    expect(rows[0].gl_suggestion_source).toBe("ai");
    expect(rows[0].gl_account_id).toBeNull();
    expect(rows[0].is_user_confirmed).toBe(false);
  });

  it("sets suggestion columns to null when no suggestion", () => {
    const items = [
      { description: "Consulting", quantity: 1, unitPrice: 200, amount: 200, sortOrder: 0, suggestedGlAccountId: null },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].suggested_gl_account_id).toBeNull();
    expect(rows[0].gl_suggestion_source).toBeNull();
    expect(rows[0].gl_account_id).toBeNull();
    expect(rows[0].is_user_confirmed).toBe(false);
  });
});
