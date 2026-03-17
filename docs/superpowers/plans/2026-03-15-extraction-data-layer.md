# Extraction Data Layer (DOC-16) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust mapping utility and reusable data access layer for extracted invoice data, hardening the AI response → DB pipeline and providing query/update functions for the review UI.

**Architecture:** Three new files: `mapper.ts` (validate/normalize AI JSON → DB row format), `data.ts` (read/update queries against `extracted_data` + `extracted_line_items`), and refactored `run.ts` (use mapper instead of inline mapping). The mapper never throws on unexpected input — it logs anomalies and stores what it can.

**Tech Stack:** TypeScript, Supabase (server client for reads, admin client for writes), Vitest for tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/extraction/mapper.ts` | Create | Validate AI JSON shape, normalize values (strip `$`, coerce dates, uppercase currency), map to DB row format |
| `lib/extraction/mapper.test.ts` | Create | Unit tests for mapper edge cases |
| `lib/extraction/data.ts` | Create | Data access layer: `getExtractedData()`, `updateExtractedField()` |
| `lib/extraction/data.test.ts` | Create | Unit tests for data access functions |
| `lib/extraction/run.ts` | Modify | Replace inline DB mapping with mapper functions |
| `lib/extraction/run.test.ts` | Modify | Update tests to reflect mapper usage |
| `lib/extraction/types.ts` | Modify | Add DB row types for mapper output |

---

## Chunk 1: Mapper Utility

### Task 1: Add DB row types to `types.ts`

**Files:**
- Modify: `lib/extraction/types.ts`

- [ ] **Step 1: Add DB row types**

Add types representing the shape of rows inserted into `extracted_data` and `extracted_line_items` tables. These are the mapper's output types.

```typescript
// Append to lib/extraction/types.ts

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
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/extraction/types.ts
git commit -m "feat: add DB row types for extraction mapper (DOC-16)"
```

---

### Task 2: Build the mapper with tests (TDD)

**Files:**
- Create: `lib/extraction/mapper.ts`
- Create: `lib/extraction/mapper.test.ts`

The mapper takes an `ExtractionResult` + metadata and returns DB-ready rows. It normalizes values and never throws.

- [ ] **Step 1: Write failing tests for the mapper**

```typescript
// lib/extraction/mapper.test.ts
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
      { description: "Widget A", quantity: 10, unitPrice: 90, amount: 900, sortOrder: 0 },
      { description: "Widget B", quantity: 5, unitPrice: 20, amount: 100, sortOrder: 1 },
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
      { description: null, quantity: null, unitPrice: null, amount: null, sortOrder: 0 },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].description).toBeNull();
    expect(rows[0].quantity).toBeNull();
  });

  it("defaults quantity to 1 when null but unit_price and amount are present", () => {
    const items = [
      { description: "Flat fee", quantity: null, unitPrice: 100, amount: 100, sortOrder: 0 },
    ];

    const rows = mapToLineItemRows(items, "ed-1");
    expect(rows[0].quantity).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/mapper.test.ts`
Expected: FAIL — module `./mapper` does not exist

- [ ] **Step 3: Implement the mapper**

```typescript
// lib/extraction/mapper.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/mapper.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/mapper.ts lib/extraction/mapper.test.ts
git commit -m "feat: add extraction mapper with normalization and tests (DOC-16)"
```

---

## Chunk 2: Data Access Layer

### Task 3: Build the data access layer with tests (TDD)

**Files:**
- Create: `lib/extraction/data.ts`
- Create: `lib/extraction/data.test.ts`

Two functions: `getExtractedData(invoiceId)` reads data + line items via the RLS-aware server client; `updateExtractedField(extractedDataId, field, value)` updates a single field via the server client (used by the review UI).

- [ ] **Step 1: Write failing tests for the data access layer**

```typescript
// lib/extraction/data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------

const mockSelectSingle = vi.fn();
const mockSelectMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "extracted_data") {
        return {
          select: (cols: string) => {
            // If querying with line items join
            if (cols.includes("extracted_line_items")) {
              return {
                eq: () => ({
                  single: mockSelectSingle,
                }),
              };
            }
            return {
              eq: () => ({
                single: mockSelectSingle,
              }),
            };
          },
          update: (data: unknown) => {
            mockUpdate(data);
            return {
              eq: () => ({
                select: () => ({
                  single: mockSelectSingle,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getExtractedData, updateExtractedField } from "./data";

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const MOCK_EXTRACTED_DATA = {
  id: "ed-uuid-1",
  invoice_id: "inv-uuid-1",
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
  confidence_score: "high",
  extracted_at: "2026-03-15T10:00:00Z",
  extracted_line_items: [
    {
      id: "li-uuid-1",
      description: "Widget A",
      quantity: 10,
      unit_price: 90,
      amount: 900,
      gl_account_id: null,
      sort_order: 0,
    },
  ],
};

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("getExtractedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns extracted data with line items for a valid invoice", async () => {
    mockSelectSingle.mockResolvedValue({
      data: MOCK_EXTRACTED_DATA,
      error: null,
    });

    const result = await getExtractedData("inv-uuid-1");

    expect(result).not.toBeNull();
    expect(result!.vendor_name).toBe("Acme Corp");
    expect(result!.extracted_line_items).toHaveLength(1);
  });

  it("returns null when no extraction exists for the invoice", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const result = await getExtractedData("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns null and logs warning on unexpected Supabase error", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST500", message: "connection timeout" },
    });

    const result = await getExtractedData("inv-uuid-1");
    expect(result).toBeNull();
  });
});

describe("updateExtractedField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const UPDATABLE_FIELDS = [
    "vendor_name",
    "vendor_address",
    "invoice_number",
    "invoice_date",
    "due_date",
    "subtotal",
    "tax_amount",
    "total_amount",
    "currency",
    "payment_terms",
  ] as const;

  it("updates a valid field and returns the updated row", async () => {
    const updated = { ...MOCK_EXTRACTED_DATA, vendor_name: "New Vendor" };
    mockSelectSingle.mockResolvedValue({ data: updated, error: null });

    const result = await updateExtractedField("ed-uuid-1", "vendor_name", "New Vendor");

    expect(mockUpdate).toHaveBeenCalledWith({ vendor_name: "New Vendor" });
    expect(result).not.toBeNull();
    expect(result!.vendor_name).toBe("New Vendor");
  });

  it("rejects updates to non-editable fields", async () => {
    await expect(
      updateExtractedField("ed-uuid-1", "raw_ai_response", "{}")
    ).rejects.toThrow("Field 'raw_ai_response' is not editable");
  });

  it("rejects updates to id field", async () => {
    await expect(
      updateExtractedField("ed-uuid-1", "id", "new-id")
    ).rejects.toThrow("Field 'id' is not editable");
  });

  it.each(UPDATABLE_FIELDS)("allows update to %s", async (field) => {
    mockSelectSingle.mockResolvedValue({
      data: { ...MOCK_EXTRACTED_DATA, [field]: "updated" },
      error: null,
    });

    const result = await updateExtractedField("ed-uuid-1", field, "updated");
    expect(result).not.toBeNull();
  });

  it("returns null and logs error on Supabase failure", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });

    const result = await updateExtractedField("ed-uuid-1", "vendor_name", "Test");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/data.test.ts`
Expected: FAIL — module `./data` does not exist

- [ ] **Step 3: Implement the data access layer**

```typescript
// lib/extraction/data.ts
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

/** Fields the review UI is allowed to update */
const EDITABLE_FIELDS = new Set([
  "vendor_name",
  "vendor_address",
  "invoice_number",
  "invoice_date",
  "due_date",
  "subtotal",
  "tax_amount",
  "total_amount",
  "currency",
  "payment_terms",
]);

/**
 * Fetch extracted data + line items for an invoice.
 * Uses the RLS-aware server client — caller must be authenticated.
 * Returns null if no extraction exists.
 */
export async function getExtractedData(invoiceId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("extracted_data")
    .select(
      `
      *,
      extracted_line_items (
        id, description, quantity, unit_price, amount, gl_account_id, sort_order
      )
    `
    )
    .eq("invoice_id", invoiceId)
    .single();

  if (error || !data) {
    if (error?.code === "PGRST116") {
      // Not found — normal case for invoices not yet extracted
      return null;
    }
    logger.warn("get_extracted_data_failed", {
      invoiceId,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}

/**
 * Update a single field on extracted_data. Used by the review UI
 * when the user corrects a field.
 *
 * Only allows updates to user-editable fields (not raw_ai_response, id, etc.).
 * Uses the RLS-aware server client — caller must be authenticated.
 */
export async function updateExtractedField(
  extractedDataId: string,
  field: string,
  value: string | number | null
) {
  if (!EDITABLE_FIELDS.has(field)) {
    throw new Error(`Field '${field}' is not editable`);
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("extracted_data")
    .update({ [field]: value })
    .eq("id", extractedDataId)
    .select()
    .single();

  if (error || !data) {
    logger.error("update_extracted_field_failed", {
      extractedDataId,
      field,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/data.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/data.ts lib/extraction/data.test.ts
git commit -m "feat: add extraction data access layer (DOC-16)"
```

---

## Chunk 3: Refactor `run.ts` to Use Mapper

### Task 4: Replace inline DB mapping in `run.ts` with mapper functions

**Files:**
- Modify: `lib/extraction/run.ts` (lines 41–91)
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Update `run.ts` to use the mapper**

Replace the inline field-by-field mapping in `run.ts` with calls to `mapToExtractedDataRow()` and `mapToLineItemRows()`.

The current code (lines 41–91 in `run.ts`) manually maps each field. Replace with:

```typescript
// In run.ts — replace steps 4 and 5 (lines 41-91) with:

import { mapToExtractedDataRow, mapToLineItemRows } from "./mapper";

// ... (in the try block, after step 3)

    // 4. Store extracted_data
    const extractedDataRow = mapToExtractedDataRow(result, invoiceId);
    const { data: extractedRow, error: insertError } = await admin
      .from("extracted_data")
      .insert(extractedDataRow)
      .select("id")
      .single();

    if (insertError || !extractedRow) {
      throw new Error(
        "Failed to store extraction results: " +
          (insertError?.message ?? "unknown error")
      );
    }

    // 5. Store line items
    if (result.data.lineItems.length > 0) {
      const lineItemRows = mapToLineItemRows(
        result.data.lineItems,
        extractedRow.id
      );

      const { error: lineItemError } = await admin
        .from("extracted_line_items")
        .insert(lineItemRows);

      if (lineItemError) {
        throw new Error(
          "Failed to store line items: " + lineItemError.message
        );
      }
    }
```

The full updated `run.ts` should import `mapToExtractedDataRow` and `mapToLineItemRows` from `./mapper` and remove the inline mapping code.

- [ ] **Step 2: Run existing `run.test.ts` to verify tests still pass**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: All existing tests PASS (the mapper produces the same output as the previous inline mapping)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/run.ts
git commit -m "refactor: use mapper in extraction pipeline instead of inline mapping (DOC-16)"
```

---

## Chunk 4: Final Verification

### Task 5: Full verification and cleanup

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Verify no `any` types in new code**

Run: `grep -r "any" lib/extraction/mapper.ts lib/extraction/data.ts`
Expected: No `any` types

- [ ] **Step 6: Push branch and create PR**

```bash
git push -u origin feature/DOC-16-extraction-data-layer
gh pr create --title "feat: extraction mapper and data access layer (DOC-16)" --body "..."
```
