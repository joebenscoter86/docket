# DOC-79: History-Based GL Account Learning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record vendor+description→GL account mappings when users confirm GL accounts, and apply those mappings to future extractions (overriding AI suggestions).

**Architecture:** New `gl_account_mappings` table stores learned mappings. Write path: PATCH line-item endpoint records mappings on GL account confirmation. Read path: `runExtraction()` queries mappings after extraction and before storing line items, overriding AI suggestions with validated history matches. Frontend: "Learned" badge (green) for history-sourced mappings, "AI" badge (blue) unchanged.

**Tech Stack:** Supabase Postgres (migration), Next.js API routes, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-doc-79-gl-history-learning-design.md`

---

### Task 1: Database Migration — `gl_account_mappings` Table

**Files:**
- Create: `supabase/migrations/20260319200000_add_gl_account_mappings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- GL Account Mappings: stores vendor+description → GL account learned mappings
CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  vendor_name TEXT NOT NULL,
  description_pattern TEXT NOT NULL,
  gl_account_id TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, vendor_name, description_pattern)
);

CREATE INDEX idx_gl_account_mappings_org_vendor
  ON gl_account_mappings(org_id, vendor_name);

ALTER TABLE gl_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_account_mappings_org_access" ON gl_account_mappings
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- SQL function for upsert with usage_count increment
-- (Supabase JS upsert can't do `usage_count + 1` in ON CONFLICT update)
CREATE OR REPLACE FUNCTION upsert_gl_mapping(
  p_org_id UUID,
  p_vendor_name TEXT,
  p_description_pattern TEXT,
  p_gl_account_id TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO gl_account_mappings (org_id, vendor_name, description_pattern, gl_account_id, usage_count, last_used_at)
  VALUES (p_org_id, p_vendor_name, p_description_pattern, p_gl_account_id, 1, now())
  ON CONFLICT (org_id, vendor_name, description_pattern)
  DO UPDATE SET
    gl_account_id = EXCLUDED.gl_account_id,
    usage_count = gl_account_mappings.usage_count + 1,
    last_used_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard if using remote dev project)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319200000_add_gl_account_mappings.sql
git commit -m "feat: add gl_account_mappings table (DOC-79)"
```

---

### Task 2: Normalization Utility

**Files:**
- Create: `lib/utils/normalize.ts`
- Create: `lib/utils/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeForMatching } from "./normalize";

describe("normalizeForMatching", () => {
  it("lowercases text", () => {
    expect(normalizeForMatching("Office Supplies")).toBe("office supplies");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeForMatching("  office supplies  ")).toBe("office supplies");
  });

  it("collapses multiple spaces to single space", () => {
    expect(normalizeForMatching("office   supplies")).toBe("office supplies");
  });

  it("handles all three normalizations together", () => {
    expect(normalizeForMatching("  Office   Supplies  ")).toBe("office supplies");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeForMatching("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeForMatching("   ")).toBe("");
  });

  it("handles single word", () => {
    expect(normalizeForMatching("Consulting")).toBe("consulting");
  });

  it("preserves special characters", () => {
    expect(normalizeForMatching("Software & Subscriptions")).toBe("software & subscriptions");
  });

  it("handles tabs and newlines as whitespace", () => {
    expect(normalizeForMatching("office\t\nsupplies")).toBe("office supplies");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/normalize.test.ts`
Expected: FAIL — `normalizeForMatching` not found

- [ ] **Step 3: Write the implementation**

```typescript
// lib/utils/normalize.ts

/**
 * Normalize a string for matching: lowercase, trim, collapse whitespace.
 * Used for GL account mapping lookups (vendor names and line item descriptions).
 */
export function normalizeForMatching(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/normalize.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/utils/normalize.ts lib/utils/normalize.test.ts
git commit -m "feat: add normalizeForMatching utility (DOC-79)"
```

---

### Task 3: GL Mappings Data Layer (Upsert + Lookup)

**Files:**
- Create: `lib/extraction/gl-mappings.ts`
- Create: `lib/extraction/gl-mappings.test.ts`

- [ ] **Step 1: Write failing tests for `upsertGlMapping`**

```typescript
// lib/extraction/gl-mappings.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRpc = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, params: unknown) => {
      mockRpc(fn, params);
      return Promise.resolve({ error: null });
    },
    from: (table: string) => {
      if (table === "gl_account_mappings") {
        return {
          select: (...args: unknown[]) => {
            mockSelect(...args);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { upsertGlMapping, lookupGlMappings } from "./gl-mappings";

describe("upsertGlMapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls rpc with normalized vendor and description", async () => {
    await upsertGlMapping("org-1", "  Acme Corp  ", "  Office Supplies  ", "acc-84");

    expect(mockRpc).toHaveBeenCalledWith("upsert_gl_mapping", {
      p_org_id: "org-1",
      p_vendor_name: "acme corp",
      p_description_pattern: "office supplies",
      p_gl_account_id: "acc-84",
    });
  });

  it("skips upsert when vendor_name is empty after normalization", async () => {
    await upsertGlMapping("org-1", "   ", "Office Supplies", "acc-84");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("skips upsert when description is empty after normalization", async () => {
    await upsertGlMapping("org-1", "Acme Corp", "   ", "acc-84");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not throw when rpc fails", async () => {
    mockRpc.mockImplementation(() => Promise.resolve({ error: { message: "DB error" } }));
    // Should not throw
    await upsertGlMapping("org-1", "Acme Corp", "Office Supplies", "acc-84");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/gl-mappings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `upsertGlMapping` implementation**

```typescript
// lib/extraction/gl-mappings.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeForMatching } from "@/lib/utils/normalize";
import { logger } from "@/lib/utils/logger";

/**
 * Record a vendor+description → GL account mapping.
 * Uses upsert with ON CONFLICT to increment usage_count on repeat confirmations.
 * Non-blocking: logs errors but never throws.
 */
export async function upsertGlMapping(
  orgId: string,
  vendorName: string,
  description: string,
  glAccountId: string
): Promise<void> {
  const normalizedVendor = normalizeForMatching(vendorName);
  const normalizedDesc = normalizeForMatching(description);

  if (!normalizedVendor || !normalizedDesc) return;

  const admin = createAdminClient();

  // Use raw SQL via rpc to get proper usage_count incrementing on conflict.
  // Supabase JS upsert doesn't support `usage_count + 1` in the update clause.
  const { error } = await admin.rpc("upsert_gl_mapping", {
    p_org_id: orgId,
    p_vendor_name: normalizedVendor,
    p_description_pattern: normalizedDesc,
    p_gl_account_id: glAccountId,
  });

  if (error) {
    logger.warn("gl_mapping_upsert_failed", {
      orgId,
      vendor: normalizedVendor,
      description: normalizedDesc,
      error: error.message,
    });
  }
}

/**
 * Look up GL account mappings for an org + vendor.
 * Returns a Map of normalized description → gl_account_id.
 * Non-blocking: returns empty map on failure.
 */
export async function lookupGlMappings(
  orgId: string,
  vendorName: string
): Promise<Map<string, string>> {
  const normalizedVendor = normalizeForMatching(vendorName);
  if (!normalizedVendor) return new Map();

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("gl_account_mappings")
    .select("description_pattern, gl_account_id")
    .eq("org_id", orgId)
    .eq("vendor_name", normalizedVendor);

  if (error || !data) {
    logger.warn("gl_mapping_lookup_failed", {
      orgId,
      vendor: normalizedVendor,
      error: error?.message ?? "no data",
    });
    return new Map();
  }

  const mappings = new Map<string, string>();
  for (const row of data) {
    mappings.set(row.description_pattern, row.gl_account_id);
  }
  return mappings;
}
```

- [ ] **Step 4: Add tests for `lookupGlMappings`**

Add these tests to the same test file:

```typescript
describe("lookupGlMappings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty map when vendor is empty", async () => {
    const result = await lookupGlMappings("org-1", "   ");
    expect(result.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty map when query fails", async () => {
    // Make the select chain return an error by overriding the inner eq mock
    mockSelect.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: { message: "DB error" } })),
      })),
    });

    // Need to re-import since the mock override affects return value
    const result = await lookupGlMappings("org-1", "Acme Corp");
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run lib/extraction/gl-mappings.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/gl-mappings.ts lib/extraction/gl-mappings.test.ts
git commit -m "feat: add GL mapping upsert and lookup (DOC-79)"
```

---

### Task 4: Update ExtractedLineItem Type + Mapper

**Files:**
- Modify: `lib/extraction/types.ts`
- Modify: `lib/extraction/mapper.ts`
- Modify: `lib/extraction/mapper.test.ts`

The `ExtractedLineItem` type needs a new optional `glAccountId` field so that `runExtraction` can pass history-resolved account IDs through to the mapper. The mapper needs to use `glAccountId` instead of hardcoding `null`.

- [ ] **Step 1: Write failing test for history-sourced line item mapping**

Add to `lib/extraction/mapper.test.ts` in the "GL suggestion fields" describe block:

```typescript
it("maps history-sourced items with gl_account_id and source 'history'", () => {
  const items = [
    {
      description: "Office Supplies",
      quantity: 1,
      unitPrice: 50,
      amount: 50,
      sortOrder: 0,
      suggestedGlAccountId: "84",
      glAccountId: "84",
      glSuggestionSource: "history" as const,
    },
  ];

  const rows = mapToLineItemRows(items, "ed-1");
  expect(rows[0].gl_account_id).toBe("84");
  expect(rows[0].suggested_gl_account_id).toBe("84");
  expect(rows[0].gl_suggestion_source).toBe("history");
  expect(rows[0].is_user_confirmed).toBe(false);
});

it("keeps gl_account_id null for AI-sourced items", () => {
  const items = [
    {
      description: "Consulting",
      quantity: 1,
      unitPrice: 200,
      amount: 200,
      sortOrder: 0,
      suggestedGlAccountId: "84",
    },
  ];

  const rows = mapToLineItemRows(items, "ed-1");
  expect(rows[0].gl_account_id).toBeNull();
  expect(rows[0].suggested_gl_account_id).toBe("84");
  expect(rows[0].gl_suggestion_source).toBe("ai");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/extraction/mapper.test.ts`
Expected: FAIL — `glAccountId` property doesn't exist on type

- [ ] **Step 3: Update `ExtractedLineItem` type**

In `lib/extraction/types.ts`, add two optional fields to `ExtractedLineItem`:

```typescript
export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
  suggestedGlAccountId: string | null;
  glAccountId?: string | null;           // Set by history lookup, null for AI-only
  glSuggestionSource?: "ai" | "history"; // Override source when set by history
}
```

- [ ] **Step 4: Update `mapToLineItemRows` in mapper.ts**

Change the return object in `mapToLineItemRows` (around line 140-151 of `lib/extraction/mapper.ts`):

Replace:
```typescript
gl_account_id: null,
suggested_gl_account_id: item.suggestedGlAccountId ?? null,
gl_suggestion_source: item.suggestedGlAccountId ? "ai" : null,
```

With:
```typescript
gl_account_id: item.glAccountId ?? null,
suggested_gl_account_id: item.suggestedGlAccountId ?? null,
gl_suggestion_source: item.glSuggestionSource ?? (item.suggestedGlAccountId ? "ai" : null),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/mapper.test.ts`
Expected: All tests PASS (existing tests should still pass since `glAccountId` and `glSuggestionSource` are optional and default to `null`/`undefined`)

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/types.ts lib/extraction/mapper.ts lib/extraction/mapper.test.ts
git commit -m "feat: support history-sourced GL in type and mapper (DOC-79)"
```

---

### Task 5: History Lookup in `runExtraction`

**Files:**
- Modify: `lib/extraction/run.ts`
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Write failing test for history override**

Mock `./gl-mappings` directly in `run.test.ts` (simpler than mocking transitive admin client dependencies). Add at the top-level mocks section, near the other mocks:

```typescript
const mockLookupGlMappings = vi.fn();
vi.mock("./gl-mappings", () => ({
  lookupGlMappings: (...args: unknown[]) => mockLookupGlMappings(...args),
}));
```

Also mock `@/lib/utils/normalize` at the top level:
```typescript
vi.mock("@/lib/utils/normalize", () => ({
  normalizeForMatching: (s: string) => s.toLowerCase().trim().replace(/\s+/g, " "),
}));
```

Set the default behavior in `setupHappyPath()`:
```typescript
mockLookupGlMappings.mockResolvedValue(new Map());
```

Also add `mockLookupGlMappings` to `vi.doMock` calls in the GL describe's `beforeEach`:
```typescript
vi.doMock("./gl-mappings", () => ({
  lookupGlMappings: (...args: unknown[]) => mockLookupGlMappings(...args),
}));
```

Then add the test:

```typescript
it("overrides AI suggestion with history mapping when exact match found", async () => {
  setupHappyPath();

  const mockAccounts = [
    { Id: "84", Name: "Office Supplies", FullyQualifiedName: "Office Supplies", SubAccount: false },
    { Id: "92", Name: "Travel", FullyQualifiedName: "Travel", SubAccount: false },
  ];
  mockQueryAccounts.mockResolvedValue(mockAccounts);

  // AI suggests "92" (Travel) for this line item
  const resultWithAiSuggestion: ExtractionResult = {
    ...MOCK_RESULT,
    data: {
      ...MOCK_RESULT.data,
      vendorName: "Acme Corp",
      lineItems: [
        {
          description: "Office Supplies",
          quantity: 1,
          unitPrice: 50,
          amount: 50,
          sortOrder: 0,
          suggestedGlAccountId: "92",
        },
      ],
    },
  };
  mockExtractInvoiceData.mockResolvedValue(resultWithAiSuggestion);

  // History says "Acme Corp" + "office supplies" → account "84"
  mockLookupGlMappings.mockResolvedValue(
    new Map([["office supplies", "84"]])
  );

  const { runExtraction } = await import("./run");
  await runExtraction(BASE_PARAMS);

  // Line item should be stored with history override
  const insertedRows = mockLineItemsInsert.mock.calls[0][0];
  expect(insertedRows[0].gl_account_id).toBe("84");
  expect(insertedRows[0].suggested_gl_account_id).toBe("84");
  expect(insertedRows[0].gl_suggestion_source).toBe("history");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: FAIL — `lookupGlMappings` not called / history override not applied

- [ ] **Step 3: Implement history lookup in `runExtraction`**

In `lib/extraction/run.ts`, add import at top:

```typescript
import { lookupGlMappings } from "./gl-mappings";
import { normalizeForMatching } from "@/lib/utils/normalize";
```

After the AI suggestion validation block (step 4.5, around line 81) and before step 5 (cleanup), add the history lookup:

```typescript
// 4.6. Override AI suggestions with history-based mappings
if (result.data.vendorName && result.data.lineItems.length > 0) {
  try {
    const mappings = await lookupGlMappings(orgId, result.data.vendorName);
    if (mappings.size > 0) {
      for (const item of result.data.lineItems) {
        if (!item.description) continue;
        const normalizedDesc = normalizeForMatching(item.description);
        const historicalAccountId = mappings.get(normalizedDesc);
        if (historicalAccountId && validAccountIds?.has(historicalAccountId)) {
          item.suggestedGlAccountId = historicalAccountId;
          item.glAccountId = historicalAccountId;
          item.glSuggestionSource = "history";
        }
        // If historical account is stale (not in validAccountIds), keep AI suggestion
      }
    }
  } catch (err) {
    logger.warn("gl_history_lookup_failed", {
      action: "run_extraction",
      invoiceId,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 4: Write test for stale history mapping (account no longer valid)**

```typescript
it("discards stale history mapping and keeps AI suggestion", async () => {
  setupHappyPath();

  // Only account "92" is valid now
  const mockAccounts = [
    { Id: "92", Name: "Travel", FullyQualifiedName: "Travel", SubAccount: false },
  ];
  mockQueryAccounts.mockResolvedValue(mockAccounts);

  const resultWithAiSuggestion: ExtractionResult = {
    ...MOCK_RESULT,
    data: {
      ...MOCK_RESULT.data,
      vendorName: "Acme Corp",
      lineItems: [
        {
          description: "Office Supplies",
          quantity: 1,
          unitPrice: 50,
          amount: 50,
          sortOrder: 0,
          suggestedGlAccountId: "92",
        },
      ],
    },
  };
  mockExtractInvoiceData.mockResolvedValue(resultWithAiSuggestion);

  // History mapping points to "84" which is no longer valid
  mockLookupGlMappings.mockResolvedValue(
    new Map([["office supplies", "84"]])
  );

  const { runExtraction } = await import("./run");
  await runExtraction(BASE_PARAMS);

  // Should keep AI suggestion since history account is stale
  const insertedRows = mockLineItemsInsert.mock.calls[0][0];
  expect(insertedRows[0].gl_account_id).toBeNull();
  expect(insertedRows[0].suggested_gl_account_id).toBe("92");
  expect(insertedRows[0].gl_suggestion_source).toBe("ai");
});
```

- [ ] **Step 5: Run all extraction tests**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat: history-based GL lookup during extraction (DOC-79)"
```

---

### Task 6: Write Path — Record Mappings in PATCH Endpoint

**Files:**
- Modify: `app/api/invoices/[id]/line-items/[itemId]/route.ts`
- Modify: `app/api/invoices/[id]/line-items/[itemId]/route.test.ts`

- [ ] **Step 1: Fix stale test mock**

The test file at `route.test.ts:44` mocks `LINE_ITEM_EDITABLE_FIELDS` without `gl_account_id`, but the real code includes it. Fix the mock:

In `route.test.ts`, line 44, change:
```typescript
LINE_ITEM_EDITABLE_FIELDS: new Set(["description", "quantity", "unit_price", "amount"]),
```
To:
```typescript
LINE_ITEM_EDITABLE_FIELDS: new Set(["description", "quantity", "unit_price", "amount", "gl_account_id"]),
```

Also update the test at line 105 ("returns 400 for invalid field name") to use a truly invalid field:
```typescript
it("returns 400 for invalid field name", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

  const { request, params } = makePatchRequest("inv-1", "li-1", { field: "raw_ai_response", value: "hack" });
  const res = await PATCH(request, { params });
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.code).toBe("VALIDATION_ERROR");
});
```

- [ ] **Step 2: Run tests to confirm fix**

Run: `npx vitest run app/api/invoices/\\[id\\]/line-items/\\[itemId\\]/route.test.ts`
Expected: All existing tests PASS

- [ ] **Step 3: Write failing test for mapping recording**

Add a mock for `upsertGlMapping` at the top of `route.test.ts`:

```typescript
const mockUpsertGlMapping = vi.fn();
vi.mock("@/lib/extraction/gl-mappings", () => ({
  upsertGlMapping: (...args: unknown[]) => mockUpsertGlMapping(...args),
}));
```

Add a mock for `extracted_data` lookup. The PATCH route will need to fetch `extracted_data.vendor_name` via the line item's `extracted_data_id`. Update the `mockServerClient.from` function to handle a query that fetches the line item's `extracted_data_id`, and a query on `extracted_data` for vendor_name.

Update `mockLineItemSelect` to return `extracted_data_id`:
```typescript
const fakeLineItem = {
  id: "li-1",
  description: "Web dev",
  quantity: 40,
  unit_price: 150,
  amount: 6000,
  gl_account_id: null,
  sort_order: 0,
  extracted_data_id: "ed-1",
};
```

Add an `extracted_data` mock to the `from` handler:
```typescript
if (table === "extracted_data") {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { vendor_name: "Acme Corp" }, error: null }),
      })),
    })),
  };
}
```

Then add these tests:

```typescript
it("records GL mapping when gl_account_id is set to a non-null value", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
  mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
  mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, gl_account_id: "acc-84" });
  mockUpsertGlMapping.mockResolvedValue(undefined);

  const { request, params } = makePatchRequest("inv-1", "li-1", { field: "gl_account_id", value: "acc-84" });
  await PATCH(request, { params });

  expect(mockUpsertGlMapping).toHaveBeenCalledWith("org-1", "Acme Corp", "Web dev", "acc-84");
});

it("does not record GL mapping when gl_account_id is set to null", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
  mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
  mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, gl_account_id: null });

  const { request, params } = makePatchRequest("inv-1", "li-1", { field: "gl_account_id", value: null });
  await PATCH(request, { params });

  expect(mockUpsertGlMapping).not.toHaveBeenCalled();
});

it("does not record GL mapping for non-gl_account_id fields", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
  mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
  mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, description: "Updated" });

  const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "Updated" });
  await PATCH(request, { params });

  expect(mockUpsertGlMapping).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run app/api/invoices/\\[id\\]/line-items/\\[itemId\\]/route.test.ts`
Expected: FAIL — `upsertGlMapping` not called

- [ ] **Step 5: Implement mapping recording in PATCH route**

In `app/api/invoices/[id]/line-items/[itemId]/route.ts`:

Add import:
```typescript
import { upsertGlMapping } from "@/lib/extraction/gl-mappings";
```

Expand the line item SELECT (line 64) to include `extracted_data_id`:
```typescript
.select("id, description, quantity, unit_price, amount, extracted_data_id")
```

After the correction recording block (after line 107, after the `recordCorrection` call), add:

```typescript
// 7. Record GL mapping when user confirms a GL account
if (field === "gl_account_id" && castValue !== null && currentItem?.extracted_data_id) {
  // Look up vendor name from extracted_data
  const { data: extractedData } = await client
    .from("extracted_data")
    .select("vendor_name")
    .eq("id", currentItem.extracted_data_id)
    .single();

  const vendorName = extractedData?.vendor_name;
  const description = currentItem.description;

  if (vendorName && description) {
    // Fire-and-forget: don't block the response
    upsertGlMapping(invoice.org_id, vendorName, description, String(castValue)).catch(() => {
      // Already logged inside upsertGlMapping
    });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/api/invoices/\\[id\\]/line-items/\\[itemId\\]/route.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/invoices/\\[id\\]/line-items/\\[itemId\\]/route.ts app/api/invoices/\\[id\\]/line-items/\\[itemId\\]/route.test.ts
git commit -m "feat: record GL mapping on account confirmation (DOC-79)"
```

---

### Task 7: Frontend — "Learned" Badge in GlAccountSelect

**Files:**
- Modify: `components/invoices/GlAccountSelect.tsx`
- Modify: `components/invoices/GlAccountSelect.test.tsx`

- [ ] **Step 1: Write failing test for "Learned" badge**

Add to `components/invoices/GlAccountSelect.test.tsx`:

```typescript
it("shows 'Learned' badge when suggestionSource is 'history' and account is pre-filled", () => {
  render(
    <GlAccountSelect
      {...defaultProps}
      currentAccountId="acc-2"
      suggestedAccountId="acc-2"
      suggestionSource="history"
    />
  );

  // "Learned" badge should be visible
  expect(screen.getByText("Learned")).toBeInTheDocument();
  // Should NOT show AI suggestion pill
  expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
});

it("does not show 'Learned' badge after user changes selection (cleared source)", () => {
  render(
    <GlAccountSelect
      {...defaultProps}
      currentAccountId="acc-1"
      suggestedAccountId="acc-2"
      suggestionSource={null}
    />
  );

  expect(screen.queryByText("Learned")).toBeNull();
});

it("shows 'Learned' prefix in dropdown for history-sourced suggestion", () => {
  render(
    <GlAccountSelect
      {...defaultProps}
      currentAccountId="acc-2"
      suggestedAccountId="acc-2"
      suggestionSource="history"
    />
  );

  const select = screen.getByRole("combobox") as HTMLSelectElement;
  const options = Array.from(select.options);
  // The selected account should appear first with "Learned ·" prefix
  expect(options[1].text).toBe("Learned · Software & Subscriptions");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/GlAccountSelect.test.tsx`
Expected: FAIL — "Learned" text not found

- [ ] **Step 3: Update GlAccountSelect component**

In `components/invoices/GlAccountSelect.tsx`, update the rendering logic:

1. After the `showSuggestion` logic (line 73), add a check for history badge:

```typescript
const showHistoryBadge = currentAccountId && suggestedAccountId === currentAccountId && suggestionSource === "history";
```

2. Update `orderedAccounts` to also handle history prefix. Extract the history account lookup into a variable for clarity:

```typescript
const historyAccount = showHistoryBadge
  ? accounts.find((a) => a.value === suggestedAccountId) ?? null
  : null;

const orderedAccounts = suggestedAccount
  ? [suggestedAccount, ...accounts.filter((a) => a.value !== suggestedAccountId)]
  : historyAccount
    ? [historyAccount, ...accounts.filter((a) => a.value !== suggestedAccountId)]
    : accounts;
```

3. Update the option label logic in the dropdown to handle "Learned ·" prefix:

```typescript
{orderedAccounts.map((a) => (
  <option key={a.value} value={a.value}>
    {a.value === suggestedAccountId && showSuggestion
      ? `AI · ${a.label}`
      : a.value === suggestedAccountId && showHistoryBadge
        ? `Learned · ${a.label}`
        : a.label}
  </option>
))}
```

4. After the suggestion pill button (line 132), add the "Learned" badge for history sources:

```typescript
{showHistoryBadge && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 border border-green-200 text-xs text-green-700">
    <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
    <span className="font-medium">Learned</span>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invoices/GlAccountSelect.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/invoices/GlAccountSelect.tsx components/invoices/GlAccountSelect.test.tsx
git commit -m "feat: 'Learned' badge for history-sourced GL suggestions (DOC-79)"
```

---

### Task 8: Frontend — Clear Badge on User Override

**Files:**
- Modify: `components/invoices/LineItemEditor.tsx`

When a user changes a history-filled GL account, the `gl_suggestion_source` should be cleared locally so the "Learned" badge disappears.

- [ ] **Step 1: Update `handleGlAccountSelect` in LineItemEditor.tsx**

In the `handleGlAccountSelect` callback (around line 236), after the `dispatch SET_ITEM_VALUE` call for `gl_account_id`, add a dispatch to clear the suggestion source:

```typescript
const handleGlAccountSelect = useCallback(
  async (itemId: string, accountId: string | null): Promise<boolean> => {
    dispatch({ type: "SET_ITEM_VALUE", itemId, field: "gl_account_id", value: accountId });
    // Clear suggestion source so badge disappears on user override
    dispatch({ type: "SET_ITEM_VALUE", itemId, field: "gl_suggestion_source", value: null });

    const ok = await saveField(itemId, "gl_account_id", accountId);
    // ... rest unchanged
```

- [ ] **Step 2: Verify by running full test suite**

Run: `npx vitest run components/invoices/`
Expected: All component tests PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/LineItemEditor.tsx
git commit -m "feat: clear suggestion badge on user GL override (DOC-79)"
```

---

### Task 9: Full Build Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Final commit if any cleanup needed**

If lint/build/type issues are found, fix and commit with:
```bash
git commit -m "fix: address lint/type issues (DOC-79)"
```

---

### Task 10: Status Report + PR

- [ ] **Step 1: Write status report**

Follow the STATUS REPORT format from CLAUDE.md.

- [ ] **Step 2: Push branch and create PR**

```bash
git push -u origin feature/DOC-79-gl-history-learning
gh pr create --title "feat: history-based GL account learning (DOC-79)" --body "..."
```
