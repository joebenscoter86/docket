# DOC-21: Editable Extraction Form — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the editable extraction form that auto-saves on blur, with inline validation, changed-field indicators, and total auto-calculation.

**Architecture:** Client-side form component (`ExtractionForm.tsx`) uses `useReducer` for state, calls a new `PATCH /api/invoices/[id]/extracted-data` API route on blur. The route delegates to the existing `updateExtractedField()` in `lib/extraction/data.ts` and records corrections. A `lib/utils/currency.ts` helper handles display formatting.

**Tech Stack:** Next.js 14 App Router, React `useReducer`, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-doc-21-extraction-form-design.md`

---

## Chunk 1: Shared Types, Currency Helper, and Data Layer

### Task 1: Add shared types to `lib/types/invoice.ts`

**Files:**
- Modify: `lib/types/invoice.ts`

- [ ] **Step 1: Add `ExtractedLineItemRow` and `ExtractedDataRow` types**

```typescript
// Append after the existing InvoiceStatus type:

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
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
git add lib/types/invoice.ts
git commit -m "feat: add ExtractedDataRow and ExtractedLineItemRow shared types (DOC-21)"
```

---

### Task 2: Currency formatting helper with tests (TDD)

**Files:**
- Create: `lib/utils/currency.ts`
- Create: `lib/utils/currency.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/utils/currency.test.ts
import { describe, it, expect } from "vitest";
import { formatCurrency, parseCurrencyInput, getCurrencySymbol } from "./currency";

describe("getCurrencySymbol", () => {
  it("returns $ for USD", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });

  it("returns $ for CAD", () => {
    expect(getCurrencySymbol("CAD")).toBe("$");
  });

  it("returns $ for AUD", () => {
    expect(getCurrencySymbol("AUD")).toBe("$");
  });

  it("returns € for EUR", () => {
    expect(getCurrencySymbol("EUR")).toBe("€");
  });

  it("returns £ for GBP", () => {
    expect(getCurrencySymbol("GBP")).toBe("£");
  });

  it("returns ISO code for unknown currencies", () => {
    expect(getCurrencySymbol("JPY")).toBe("JPY ");
  });

  it("returns $ for null currency (defaults to USD)", () => {
    expect(getCurrencySymbol(null)).toBe("$");
  });
});

describe("formatCurrency", () => {
  it("formats a number with $ and two decimals", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats zero", () => {
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });

  it("formats EUR with € symbol", () => {
    expect(formatCurrency(99.9, "EUR")).toBe("€99.90");
  });

  it("returns empty string for null", () => {
    expect(formatCurrency(null, "USD")).toBe("");
  });
});

describe("parseCurrencyInput", () => {
  it("parses a plain number string", () => {
    expect(parseCurrencyInput("1234.56")).toBe(1234.56);
  });

  it("strips commas before parsing", () => {
    expect(parseCurrencyInput("1,234.56")).toBe(1234.56);
  });

  it("strips currency symbols before parsing", () => {
    expect(parseCurrencyInput("$1,234.56")).toBe(1234.56);
  });

  it("returns null for empty string", () => {
    expect(parseCurrencyInput("")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseCurrencyInput("abc")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parseCurrencyInput("-50")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/currency.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement currency helpers**

```typescript
// lib/utils/currency.ts
const SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  EUR: "€",
  GBP: "£",
};

export function getCurrencySymbol(currency: string | null): string {
  const code = currency ?? "USD";
  return SYMBOLS[code] ?? `${code} `;
}

export function formatCurrency(
  value: number | null,
  currency: string | null
): string {
  if (value === null) return "";
  const symbol = getCurrencySymbol(currency);
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function parseCurrencyInput(input: string): number | null {
  const cleaned = input.replace(/[$€£,]/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  if (isNaN(num) || num < 0) return null;
  return num;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/currency.test.ts`
Expected: PASS — all 13 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/utils/currency.ts lib/utils/currency.test.ts
git commit -m "feat: currency formatting helpers with tests (DOC-21)"
```

---

### Task 3: Add `recordCorrection()` to data layer (TDD)

**Files:**
- Modify: `lib/extraction/data.ts`
- Modify: `lib/extraction/data.test.ts`

- [ ] **Step 1: Write failing tests for `recordCorrection`**

Add to the bottom of `lib/extraction/data.test.ts`:

```typescript
// Add a mockInsert at the top of the file alongside existing mocks:
const mockInsert = vi.fn();

// Update the mock factory for createClient to also handle the "corrections" table:
// In the `from` function, add:
//   if (table === "corrections") {
//     return { insert: mockInsert };
//   }

describe("recordCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a correction row with all fields", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Acme Corp",
      "Acme Corporation"
    );

    expect(mockInsert).toHaveBeenCalledWith({
      invoice_id: "inv-uuid-1",
      org_id: "org-uuid-1",
      field_name: "vendor_name",
      original_value: "Acme Corp",
      corrected_value: "Acme Corporation",
    });
  });

  it("handles null original value", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "subtotal",
      null,
      "100.00"
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_value: null,
        corrected_value: "100.00",
      })
    );
  });

  it("logs error on Supabase failure but does not throw", async () => {
    mockInsert.mockResolvedValue({ error: { message: "RLS violation" } });

    // Should not throw
    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Old",
      "New"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/data.test.ts`
Expected: FAIL — `recordCorrection` not exported

- [ ] **Step 3: Export `EDITABLE_FIELDS` from `data.ts`**

The existing `EDITABLE_FIELDS` constant (line 5 of `data.ts`) is currently not exported. Add the `export` keyword so the API route can import it instead of duplicating the list:

```typescript
export const EDITABLE_FIELDS = new Set([...]);
```

- [ ] **Step 4: Implement `recordCorrection`**

Add to the bottom of `lib/extraction/data.ts`:

```typescript
/**
 * Record a user correction for learning/audit purposes.
 * Non-critical: logs errors but does not throw.
 */
export async function recordCorrection(
  invoiceId: string,
  orgId: string,
  fieldName: string,
  originalValue: string | null,
  correctedValue: string | null
) {
  const supabase = createClient();

  const { error } = await supabase.from("corrections").insert({
    invoice_id: invoiceId,
    org_id: orgId,
    field_name: fieldName,
    original_value: originalValue,
    corrected_value: correctedValue,
  });

  if (error) {
    logger.error("record_correction_failed", {
      invoiceId,
      orgId,
      field: fieldName,
      error: error.message,
      status: "error",
    });
  }
}
```

- [ ] **Step 5: Update the Supabase mock in `data.test.ts`**

The mock's `from()` function needs to route `"corrections"` to `{ insert: mockInsert }`. Update the existing `vi.mock("@/lib/supabase/server", ...)` block — add the branch **before** the `throw`:

```typescript
// In the existing createClient mock, update the from() function:
from: (table: string) => {
  if (table === "extracted_data") {
    return {
      select: () => ({
        eq: () => ({ single: mockSelectSingle }),
      }),
      update: (data: unknown) => {
        mockUpdate(data);
        return {
          eq: () => ({ select: () => ({ single: mockSelectSingle }) }),
        };
      },
    };
  }
  if (table === "corrections") {
    return { insert: mockInsert };
  }
  throw new Error(`Unexpected table: ${table}`);
},
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/data.test.ts`
Expected: PASS — all tests pass (existing + new)

- [ ] **Step 7: Commit**

```bash
git add lib/extraction/data.ts lib/extraction/data.test.ts
git commit -m "feat: add recordCorrection and export EDITABLE_FIELDS (DOC-21)"
```

---

## Chunk 2: PATCH API Route

### Task 4: Build the PATCH `/api/invoices/[id]/extracted-data` route (TDD)

**Files:**
- Create: `app/api/invoices/[id]/extracted-data/route.test.ts`
- Create: `app/api/invoices/[id]/extracted-data/route.ts`

- [ ] **Step 1: Write failing tests**

Follow the pattern from `app/api/invoices/[id]/extract/route.test.ts`. The test file mocks:
- `@/lib/supabase/server` — server client for auth + RLS reads
- `@/lib/extraction/data` — `updateExtractedField` and `recordCorrection`
- `@/lib/utils/logger` — logger

```typescript
// app/api/invoices/[id]/extracted-data/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetUser = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockInvoiceSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockExtractedDataSelect,
          })),
        })),
      };
    }
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockInvoiceSelect,
          })),
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockUpdateExtractedField = vi.fn();
const mockRecordCorrection = vi.fn();
vi.mock("@/lib/extraction/data", () => ({
  updateExtractedField: (...args: unknown[]) => mockUpdateExtractedField(...args),
  recordCorrection: (...args: unknown[]) => mockRecordCorrection(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "./route";

// --- Helpers ---
function makeRequest(invoiceId: string, body: Record<string, unknown>) {
  return {
    request: new Request(
      `http://localhost/api/invoices/${invoiceId}/extracted-data`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeExtractedData = {
  id: "ed-1",
  invoice_id: "inv-1",
  vendor_name: "Acme Corp",
  subtotal: 100,
  tax_amount: 10,
  total_amount: 110,
};

describe("PATCH /api/invoices/[id]/extracted-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "New Vendor",
    });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when field is missing from body", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { request, params } = makeRequest("inv-1", { value: "test" });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when field is not in allowlist", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { request, params } = makeRequest("inv-1", {
      field: "raw_ai_response",
      value: "hacked",
    });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when extracted data not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "New",
    });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 200 and saves field on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { id: "inv-1", org_id: "org-1" },
      error: null,
    });
    mockUpdateExtractedField.mockResolvedValue({
      ...fakeExtractedData,
      vendor_name: "New Vendor",
    });

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "New Vendor",
    });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ field: "vendor_name", value: "New Vendor", saved: true });
    expect(mockUpdateExtractedField).toHaveBeenCalledWith("ed-1", "vendor_name", "New Vendor");
  });

  it("records a correction when value differs from original", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { id: "inv-1", org_id: "org-1" },
      error: null,
    });
    mockUpdateExtractedField.mockResolvedValue({
      ...fakeExtractedData,
      vendor_name: "New Vendor",
    });
    mockRecordCorrection.mockResolvedValue(undefined);

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "New Vendor",
    });
    await PATCH(request, { params });

    expect(mockRecordCorrection).toHaveBeenCalledWith(
      "inv-1",
      "org-1",
      "vendor_name",
      "Acme Corp",
      "New Vendor"
    );
  });

  it("does not record correction when value is unchanged", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { id: "inv-1", org_id: "org-1" },
      error: null,
    });
    mockUpdateExtractedField.mockResolvedValue(fakeExtractedData);

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "Acme Corp",
    });
    await PATCH(request, { params });

    expect(mockRecordCorrection).not.toHaveBeenCalled();
  });

  it("returns 500 when updateExtractedField returns null", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockUpdateExtractedField.mockResolvedValue(null);

    const { request, params } = makeRequest("inv-1", {
      field: "vendor_name",
      value: "New",
    });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/invoices/[id]/extracted-data/route.test.ts"`
Expected: FAIL — cannot find `./route`

- [ ] **Step 3: Implement the PATCH route**

```typescript
// app/api/invoices/[id]/extracted-data/route.ts
import { createClient } from "@/lib/supabase/server";
import { updateExtractedField, recordCorrection, EDITABLE_FIELDS } from "@/lib/extraction/data";
import {
  authError,
  notFound,
  validationError,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const start = Date.now();

  // 1. Auth
  const client = createClient();
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !user) {
    return authError();
  }

  logger.info("update_field_start", { invoiceId, userId: user.id });

  // 2. Parse + validate body
  let body: { field?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body");
  }

  const { field, value } = body;
  if (!field || typeof field !== "string") {
    return validationError("Missing or invalid 'field' parameter");
  }
  if (!EDITABLE_FIELDS.has(field)) {
    return validationError(`Field '${field}' is not editable`);
  }

  // 3. Fetch extracted_data (RLS enforces ownership)
  const { data: extractedData, error: edError } = await client
    .from("extracted_data")
    .select("id, invoice_id, vendor_name, vendor_address, invoice_number, invoice_date, due_date, payment_terms, currency, subtotal, tax_amount, total_amount")
    .eq("invoice_id", invoiceId)
    .single();

  if (edError || !extractedData) {
    logger.warn("update_field_not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Extracted data not found for this invoice");
  }

  const preUpdateValue = extractedData[field as keyof typeof extractedData];

  // 4. Update the field
  const castValue = value as string | number | null;
  const updated = await updateExtractedField(extractedData.id, field, castValue);
  if (!updated) {
    logger.error("update_field_failed", {
      invoiceId,
      userId: user.id,
      field,
      durationMs: Date.now() - start,
      status: "error",
    });
    return internalError("Failed to update field");
  }

  // 5. Record correction if value changed
  const stringifyValue = (v: unknown) => (v === null || v === undefined ? null : String(v));
  if (stringifyValue(castValue) !== stringifyValue(preUpdateValue)) {
    // Fetch org_id from invoice
    const { data: invoice } = await client
      .from("invoices")
      .select("org_id")
      .eq("id", invoiceId)
      .single();

    if (invoice?.org_id) {
      await recordCorrection(
        invoiceId,
        invoice.org_id,
        field,
        stringifyValue(preUpdateValue),
        stringifyValue(castValue)
      );
    }
  }

  logger.info("update_field_success", {
    invoiceId,
    userId: user.id,
    field,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ field, value: castValue, saved: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/invoices/[id]/extracted-data/route.test.ts"`
Expected: PASS — all 7 tests pass

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions

- [ ] **Step 6: Commit**

```bash
git add "app/api/invoices/[id]/extracted-data/route.ts" "app/api/invoices/[id]/extracted-data/route.test.ts"
git commit -m "feat: PATCH endpoint for extracted field updates with tests (DOC-21)"
```

---

## Chunk 3: ExtractionForm Component

### Task 5: Build the form reducer and validation helpers

**Files:**
- Create: `components/invoices/extraction-form-reducer.ts`
- Create: `components/invoices/extraction-form-reducer.test.ts`

- [ ] **Step 1: Write failing tests for the reducer**

```typescript
// components/invoices/extraction-form-reducer.test.ts
import { describe, it, expect } from "vitest";
import {
  formReducer,
  initFormState,
  validateField,
  type FormState,
} from "./extraction-form-reducer";

const MOCK_EXTRACTED = {
  vendor_name: "Acme Corp",
  vendor_address: "123 Main St",
  invoice_number: "INV-001",
  invoice_date: "2026-03-01",
  due_date: "2026-03-31",
  payment_terms: "Net 30",
  currency: "USD",
  subtotal: 900,
  tax_amount: 90,
  total_amount: 990,
};

describe("initFormState", () => {
  it("initializes values and originalValues from extracted data", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.values.vendor_name).toBe("Acme Corp");
    expect(state.originalValues.vendor_name).toBe("Acme Corp");
    expect(state.values.subtotal).toBe(900);
  });

  it("initializes lastSavedValues matching values", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.lastSavedValues.vendor_name).toBe("Acme Corp");
    expect(state.lastSavedValues.subtotal).toBe(900);
  });

  it("sets all field statuses to idle", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.fieldStatus.vendor_name).toBe("idle");
    expect(state.fieldStatus.total_amount).toBe("idle");
  });

  it("sets all field errors to null", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.fieldErrors.vendor_name).toBeNull();
  });
});

describe("formReducer", () => {
  let state: FormState;

  beforeEach(() => {
    state = initFormState(MOCK_EXTRACTED);
  });

  it("SET_VALUE updates the value for a field", () => {
    const next = formReducer(state, {
      type: "SET_VALUE",
      field: "vendor_name",
      value: "New Vendor",
    });
    expect(next.values.vendor_name).toBe("New Vendor");
    // originalValues unchanged
    expect(next.originalValues.vendor_name).toBe("Acme Corp");
  });

  it("SET_FIELD_STATUS updates status for a field", () => {
    const next = formReducer(state, {
      type: "SET_FIELD_STATUS",
      field: "vendor_name",
      status: "saving",
    });
    expect(next.fieldStatus.vendor_name).toBe("saving");
  });

  it("SET_FIELD_ERROR updates error for a field", () => {
    const next = formReducer(state, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: "Must be a valid amount",
    });
    expect(next.fieldErrors.subtotal).toBe("Must be a valid amount");
  });

  it("SET_FIELD_ERROR with null clears the error", () => {
    let next = formReducer(state, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: "Must be a valid amount",
    });
    next = formReducer(next, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: null,
    });
    expect(next.fieldErrors.subtotal).toBeNull();
  });

  it("MARK_SAVED updates lastSavedValues for a field", () => {
    const next = formReducer(state, {
      type: "MARK_SAVED",
      field: "vendor_name",
      value: "New Vendor",
    });
    expect(next.lastSavedValues.vendor_name).toBe("New Vendor");
    // values and originalValues unchanged
    expect(next.values.vendor_name).toBe("Acme Corp");
    expect(next.originalValues.vendor_name).toBe("Acme Corp");
  });
});

describe("validateField", () => {
  it("returns null for valid vendor_name", () => {
    expect(validateField("vendor_name", "Acme")).toBeNull();
  });

  it("returns error for negative subtotal", () => {
    expect(validateField("subtotal", -10)).toBe("Must be a valid amount");
  });

  it("returns error for NaN amount", () => {
    expect(validateField("subtotal", NaN)).toBe("Must be a valid amount");
  });

  it("returns null for zero amount", () => {
    expect(validateField("subtotal", 0)).toBeNull();
  });

  it("returns null for null amount (clearing the field)", () => {
    expect(validateField("subtotal", null)).toBeNull();
  });

  it("returns null for valid dates", () => {
    expect(validateField("invoice_date", "2026-03-01")).toBeNull();
  });

  it("returns null for null date (clearing)", () => {
    expect(validateField("invoice_date", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/extraction-form-reducer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the reducer and helpers**

```typescript
// components/invoices/extraction-form-reducer.ts

const FORM_FIELDS = [
  "vendor_name",
  "vendor_address",
  "invoice_number",
  "invoice_date",
  "due_date",
  "payment_terms",
  "currency",
  "subtotal",
  "tax_amount",
  "total_amount",
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

const AMOUNT_FIELDS = new Set<string>(["subtotal", "tax_amount", "total_amount"]);

export interface FormState {
  values: Record<string, string | number | null>;
  originalValues: Record<string, string | number | null>;
  lastSavedValues: Record<string, string | number | null>;
  fieldStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  fieldErrors: Record<string, string | null>;
}

export type FormAction =
  | { type: "SET_VALUE"; field: string; value: string | number | null }
  | {
      type: "SET_FIELD_STATUS";
      field: string;
      status: "idle" | "saving" | "saved" | "error";
    }
  | { type: "SET_FIELD_ERROR"; field: string; error: string | null }
  | { type: "MARK_SAVED"; field: string; value: string | number | null };

export function initFormState(
  extracted: Record<string, string | number | null>
): FormState {
  const values: Record<string, string | number | null> = {};
  const originalValues: Record<string, string | number | null> = {};
  const lastSavedValues: Record<string, string | number | null> = {};
  const fieldStatus: Record<string, "idle" | "saving" | "saved" | "error"> = {};
  const fieldErrors: Record<string, string | null> = {};

  for (const field of FORM_FIELDS) {
    const val = extracted[field] ?? null;
    values[field] = val;
    originalValues[field] = val;
    lastSavedValues[field] = val;
    fieldStatus[field] = "idle";
    fieldErrors[field] = null;
  }

  return { values, originalValues, lastSavedValues, fieldStatus, fieldErrors };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_VALUE":
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
      };
    case "SET_FIELD_STATUS":
      return {
        ...state,
        fieldStatus: { ...state.fieldStatus, [action.field]: action.status },
      };
    case "SET_FIELD_ERROR":
      return {
        ...state,
        fieldErrors: { ...state.fieldErrors, [action.field]: action.error },
      };
    case "MARK_SAVED":
      return {
        ...state,
        lastSavedValues: { ...state.lastSavedValues, [action.field]: action.value },
      };
    default:
      return state;
  }
}

export function validateField(
  field: string,
  value: string | number | null
): string | null {
  if (value === null || value === "") return null;

  if (AMOUNT_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num) || num < 0) return "Must be a valid amount";
  }

  return null;
}

export { FORM_FIELDS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invoices/extraction-form-reducer.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/invoices/extraction-form-reducer.ts components/invoices/extraction-form-reducer.test.ts
git commit -m "feat: form reducer and validation helpers with tests (DOC-21)"
```

---

### Task 6: Build `ExtractionForm` component

**Files:**
- Rewrite: `components/invoices/ExtractionForm.tsx`

- [ ] **Step 1: Implement the full form component**

```typescript
// components/invoices/ExtractionForm.tsx
"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import {
  formReducer,
  initFormState,
  validateField,
  FORM_FIELDS,
  type FormField,
} from "./extraction-form-reducer";
import { formatCurrency, parseCurrencyInput, getCurrencySymbol } from "@/lib/utils/currency";
import type { ExtractedDataRow } from "@/lib/types/invoice";

interface ExtractionFormProps {
  extractedData: ExtractedDataRow;
  invoiceId: string;
}

const FIELD_CONFIG: Record<
  FormField,
  { label: string; type: "text" | "textarea" | "date" | "currency" | "select" }
> = {
  vendor_name: { label: "Vendor Name", type: "text" },
  vendor_address: { label: "Vendor Address", type: "textarea" },
  invoice_number: { label: "Invoice Number", type: "text" },
  invoice_date: { label: "Invoice Date", type: "date" },
  due_date: { label: "Due Date", type: "date" },
  payment_terms: { label: "Payment Terms", type: "text" },
  currency: { label: "Currency", type: "select" },
  subtotal: { label: "Subtotal", type: "currency" },
  tax_amount: { label: "Tax Amount", type: "currency" },
  total_amount: { label: "Total Amount", type: "currency" },
};

const CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "AUD"];

const SECTION_1_FIELDS: FormField[] = [
  "vendor_name",
  "vendor_address",
  "invoice_number",
  "payment_terms",
  "invoice_date",
  "due_date",
  "currency",
];

const SECTION_2_FIELDS: FormField[] = ["subtotal", "tax_amount", "total_amount"];

export default function ExtractionForm({
  extractedData,
  invoiceId,
}: ExtractionFormProps) {
  const [state, dispatch] = useReducer(
    formReducer,
    extractedData as unknown as Record<string, string | number | null>,
    initFormState
  );

  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const saveField = useCallback(
    async (field: string, value: string | number | null) => {
      dispatch({ type: "SET_FIELD_STATUS", field, status: "saving" });

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/extracted-data`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });

        if (!res.ok) {
          dispatch({ type: "SET_FIELD_STATUS", field, status: "error" });
          return false;
        }

        dispatch({ type: "SET_FIELD_STATUS", field, status: "saved" });

        // Clear "saved" after 2s
        if (savedTimers.current[field]) clearTimeout(savedTimers.current[field]);
        savedTimers.current[field] = setTimeout(() => {
          dispatch({ type: "SET_FIELD_STATUS", field, status: "idle" });
        }, 2000);

        return true;
      } catch {
        dispatch({ type: "SET_FIELD_STATUS", field, status: "error" });
        return false;
      }
    },
    [invoiceId]
  );

  const handleBlur = useCallback(
    async (field: string) => {
      setFocusedField(null);
      const value = state.values[field];

      // Validate
      const error = validateField(field, value);
      dispatch({ type: "SET_FIELD_ERROR", field, error });
      if (error) return;

      // Skip if unchanged from last saved value
      const lastSaved = state.lastSavedValues[field];
      if (String(value ?? "") === String(lastSaved ?? "")) return;

      // Capture current subtotal/tax before async save (avoid stale closure)
      const currentSubtotal = state.values.subtotal;
      const currentTax = state.values.tax_amount;

      const saved = await saveField(field, value);
      if (saved) {
        dispatch({ type: "MARK_SAVED", field, value });
      }

      // Auto-calculate total when subtotal or tax changes
      if (saved && (field === "subtotal" || field === "tax_amount")) {
        const subtotal =
          field === "subtotal" ? (typeof value === "number" ? value : null)
            : (typeof currentSubtotal === "number" ? currentSubtotal : null);
        const tax =
          field === "tax_amount" ? (typeof value === "number" ? value : null)
            : (typeof currentTax === "number" ? currentTax : null);

        if (subtotal !== null && tax !== null) {
          const newTotal = Math.round((subtotal + tax) * 100) / 100;
          dispatch({ type: "SET_VALUE", field: "total_amount", value: newTotal });
          const totalSaved = await saveField("total_amount", newTotal);
          if (totalSaved) {
            dispatch({ type: "MARK_SAVED", field: "total_amount", value: newTotal });
          }
        }
      }
    },
    [state.values, state.lastSavedValues, saveField]
  );

  const handleChange = useCallback(
    (field: string, rawValue: string) => {
      // Always store raw string while typing. Currency fields get parsed on blur.
      dispatch({
        type: "SET_VALUE",
        field,
        value: rawValue === "" ? null : rawValue,
      });
    },
    []
  );

  const isChanged = (field: string) =>
    String(state.values[field] ?? "") !== String(state.originalValues[field] ?? "");

  const totalMismatch = (() => {
    const s = state.values.subtotal;
    const t = state.values.tax_amount;
    const total = state.values.total_amount;
    if (typeof s === "number" && typeof t === "number" && typeof total === "number") {
      return Math.abs(s + t - total) > 0.01;
    }
    return false;
  })();

  const currency = (state.values.currency as string) ?? "USD";

  function renderField(field: FormField) {
    const config = FIELD_CONFIG[field];
    const value = state.values[field];
    const status = state.fieldStatus[field];
    const error = state.fieldErrors[field];
    const changed = isChanged(field);
    const isFocused = focusedField === field;

    const wrapperClass = `relative ${changed ? "border-l-2 border-blue-500 pl-3" : "pl-0"}`;

    const inputBase =
      "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
    const inputClass = `${inputBase} ${
      error ? "border-red-500" : "border-gray-200"
    }`;

    return (
      <div key={field} className={wrapperClass}>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          {config.label}
          <FieldStatusIcon status={status} />
        </label>

        {config.type === "textarea" ? (
          <textarea
            className={`${inputClass} min-h-[60px] resize-y`}
            value={value ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
            rows={2}
          />
        ) : config.type === "date" ? (
          <input
            type="date"
            className={inputClass}
            value={(value as string) ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          />
        ) : config.type === "select" ? (
          <select
            className={inputClass}
            value={(value as string) ?? "USD"}
            onChange={(e) => {
              handleChange(field, e.target.value);
              // Save immediately on select change
              saveField(field, e.target.value);
            }}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : config.type === "currency" ? (
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={
              isFocused
                ? (typeof value === "number" ? String(value) : value ?? "")
                : typeof value === "number"
                  ? formatCurrency(value, currency)
                  : value ?? ""
            }
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => {
              // Parse raw string to number on blur before saving
              const parsed = parseCurrencyInput(String(value ?? ""));
              if (parsed !== null) {
                dispatch({ type: "SET_VALUE", field, value: parsed });
              } else if (value !== null && value !== "") {
                // Invalid input — leave for validation to catch
              }
              handleBlur(field);
            }}
          />
        ) : (
          <input
            type="text"
            className={inputClass}
            value={(value as string) ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          />
        )}

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

        {field === "total_amount" && totalMismatch && (
          <p className="mt-1 text-xs text-amber-600">
            Total doesn&apos;t match subtotal + tax
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Invoice Details */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Invoice Details
        </h3>
        <div className="space-y-4">
          {/* Full width fields */}
          {renderField("vendor_name")}
          {renderField("vendor_address")}

          {/* Two-column rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("invoice_number")}
            {renderField("payment_terms")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("invoice_date")}
            {renderField("due_date")}
          </div>

          {/* Half width */}
          <div className="w-full md:w-1/2">{renderField("currency")}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* Section 2: Amounts */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Amounts
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("subtotal")}
            {renderField("tax_amount")}
          </div>
          {renderField("total_amount")}
        </div>
      </div>
    </div>
  );
}

function FieldStatusIcon({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "saving") {
    return (
      <svg
        className="h-3.5 w-3.5 animate-spin text-gray-400"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    );
  }

  if (status === "saved") {
    return (
      <svg
        className="h-3.5 w-3.5 text-green-500 transition-opacity duration-300"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        className="h-3.5 w-3.5 text-red-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "feat: extraction form component with auto-save and validation (DOC-21)"
```

---

### Task 7: Wire ExtractionForm into ReviewLayout and review page

**Files:**
- Modify: `components/invoices/ReviewLayout.tsx`
- Modify: `app/(dashboard)/invoices/[id]/review/page.tsx`

- [ ] **Step 1: Update ReviewLayout props and wiring**

In `components/invoices/ReviewLayout.tsx`:

1. Replace the loose `extractedData` type in `ReviewLayoutProps` with `ExtractedDataRow | null` (import from `@/lib/types/invoice`).
2. Add `invoiceId: string` to the `ReviewLayoutProps.invoice` object (it's already passed as `invoice.id`, just need to thread it).
3. Pass `invoiceId={invoice.id}` to `<ExtractionForm>`.

The `extractedData` prop passed to `ExtractionForm` changes from the loose type to `ExtractedDataRow`.

- [ ] **Step 2: Update the review page**

In `app/(dashboard)/invoices/[id]/review/page.tsx`:

Replace the `as any` cast with `as unknown as ExtractedDataRow` (import from `@/lib/types/invoice`). The Supabase-inferred return type from `getExtractedData` won't exactly match `ExtractedDataRow` because Supabase types `confidence_score` as `string | null` rather than the union. A safe cast through `unknown` is appropriate here since the DB CHECK constraint guarantees valid values. Add the import for `ExtractedDataRow`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS — no regressions

- [ ] **Step 5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/invoices/ReviewLayout.tsx "app/(dashboard)/invoices/[id]/review/page.tsx"
git commit -m "feat: wire ExtractionForm into review layout with typed props (DOC-21)"
```

---

## Chunk 4: Final Verification

### Task 8: Full completion self-check

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Builds successfully

- [ ] **Step 5: Verify no `any` types in new code**

Search all new/modified files for `any` type usage.

- [ ] **Step 6: Verify no `console.log` in production code**

Search new files for `console.log` — should only appear in test files or logger.ts.

- [ ] **Step 7: Push branch and create PR**

```bash
git push -u origin feature/DOC-21-extraction-form
gh pr create --title "DOC-21: Editable extraction form with auto-save and validation" --body "$(cat <<'EOF'
## Summary
- Built the editable extraction form for the review page right panel
- All extracted fields (vendor, dates, amounts, currency) are editable with auto-save on blur
- Inline validation for amounts (non-negative) and visual indicators for changed fields
- Total auto-calculates from subtotal + tax with mismatch warning
- PATCH API route for field updates with correction tracking
- Currency formatting helper (display formatted when unfocused, raw when editing)

## Test plan
- [ ] Unit tests pass for form reducer, currency helpers, data layer, and API route
- [ ] Build and lint pass clean
- [ ] Manual: navigate to review page, edit fields, verify auto-save indicators
- [ ] Manual: change subtotal, verify total auto-updates
- [ ] Manual: enter invalid amount, verify error shown

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Deliver status report**
