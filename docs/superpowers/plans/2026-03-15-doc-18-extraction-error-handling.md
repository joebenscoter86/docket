# DOC-18: Extraction Error Handling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the retry API route, tighten error messages, and add stale data cleanup so extraction retries work safely.

**Architecture:** The retry route follows the same pattern as the existing extract route (auth → ownership → guards → delegate to `runExtraction()`). Stale data cleanup lives in `runExtraction()` so both routes benefit. A new `unprocessableEntity()` helper handles the 422 response for max retries.

**Tech Stack:** Next.js API routes, Supabase (server + admin clients), Vitest + MSW mocks

**Spec:** `docs/superpowers/specs/2026-03-15-doc-18-extraction-error-handling-design.md`

---

## Chunk 1: Foundation Changes

### Task 1: Add `unprocessableEntity()` helper to `errors.ts`

**Files:**
- Modify: `lib/utils/errors.ts`

- [ ] **Step 1: Add `UNPROCESSABLE` to the ErrorCode union and add the helper**

```typescript
// In the ErrorCode union, add after "RATE_LIMITED":
| "UNPROCESSABLE"

// After rateLimited():
export function unprocessableEntity(message: string) {
  return apiError({ error: message, code: "UNPROCESSABLE", status: 422 });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/utils/errors.ts
git commit -m "feat: add unprocessableEntity helper to errors.ts (DOC-18)"
```

### Task 2: Tighten error messages in `run.ts`

**Files:**
- Modify: `lib/extraction/run.ts`
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Update error message assertions in `run.test.ts`**

In the test `"throws and sets invoice status to error when signed URL generation fails"` (line ~279), change:
```typescript
// Before:
await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
  "Failed to generate signed URL"
);
// After:
await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
  "Failed to retrieve uploaded file"
);
```

In the test `"throws when file fetch returns non-200 status"` (line ~304), change:
```typescript
// Before:
await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
  "Failed to fetch file: HTTP 403"
);
// After:
await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
  "Failed to retrieve uploaded file"
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: 2 test failures (message mismatch)

- [ ] **Step 3: Update error messages in `run.ts`**

Replace the signed URL error (line ~24-27):
```typescript
// Before:
throw new Error(
  "Failed to generate signed URL: " +
    (signedUrlError?.message ?? "unknown error")
);
// After:
throw new Error("Failed to retrieve uploaded file");
```

Replace the file fetch error (line ~33):
```typescript
// Before:
throw new Error(`Failed to fetch file: HTTP ${fileResponse.status}`);
// After:
throw new Error("Failed to retrieve uploaded file");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "fix: use user-friendly error messages for storage failures (DOC-18)"
```

### Task 3: Add stale data cleanup to `runExtraction()`

**Files:**
- Modify: `lib/extraction/run.ts`
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Write the failing test in `run.test.ts`**

Add a new mock spy for delete operations and a new test:

```typescript
// Add new mock spies near the top (after existing mock declarations ~line 30):
const mockExtractedDataDelete = vi.fn();
const mockLineItemsDelete = vi.fn();
```

Update the admin client mock's `from` function to handle delete chains:

For `extracted_data` table, add after the existing `insert` handler:
```typescript
delete: () => {
  mockExtractedDataDelete();
  return {
    eq: () => Promise.resolve({ error: null }),
  };
},
select: (cols: string) => {
  // For cleanup: select id where invoice_id = X
  if (cols === "id") {
    return {
      eq: () => Promise.resolve({ data: [], error: null }),
    };
  }
  // For other selects (shouldn't happen on this table)
  return { eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) };
},
```

For `extracted_line_items` table, add:
```typescript
delete: () => {
  mockLineItemsDelete();
  return {
    in: () => Promise.resolve({ error: null }),
  };
},
```

Add the test:
```typescript
it("deletes stale extracted_data before inserting new results", async () => {
  setupHappyPath();
  const { runExtraction } = await import("./run");

  await runExtraction(BASE_PARAMS);

  // Cleanup should query for existing extracted_data IDs, then delete
  // The exact assertion depends on whether stale data existed
  // At minimum, the select query for existing data should have been called
  expect(mockExtractedDataDelete).not.toHaveBeenCalled(); // no stale data in default mock
});
```

- [ ] **Step 2: Run test to verify it passes (baseline — no stale data)**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: all tests pass

- [ ] **Step 3: Add cleanup logic to `run.ts`**

Insert immediately before the `extracted_data` INSERT (before line 42 `const extractedDataRow = ...`). This placement ensures old data is only deleted when new extraction data is ready to be written — if the file fetch or Claude call fails, the old data is preserved.

```typescript
// Clean up stale extraction data from prior attempts
const { data: existingData } = await admin
  .from("extracted_data")
  .select("id")
  .eq("invoice_id", invoiceId);

if (existingData && existingData.length > 0) {
  const existingIds = existingData.map((row: { id: string }) => row.id);

  // Delete line items first (FK dependency)
  await admin
    .from("extracted_line_items")
    .delete()
    .in("extracted_data_id", existingIds);

  // Delete extracted_data
  await admin
    .from("extracted_data")
    .delete()
    .eq("invoice_id", invoiceId);

  logger.info("extraction_stale_data_cleaned", {
    invoiceId,
    orgId,
    userId,
    deletedIds: existingIds,
  });
}
```

- [ ] **Step 4: Add a test for when stale data exists**

Use `vi.doMock` to override the admin client mock so that `extracted_data` select returns existing stale data, then verify both delete operations are called:

```typescript
it("deletes stale extracted_data and line items when prior extraction exists", async () => {
  setupHappyPath();

  // Track delete calls
  const trackLineItemsDelete = vi.fn();
  const trackExtractedDataDelete = vi.fn();

  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
      storage: {
        from: () => ({
          createSignedUrl: mockCreateSignedUrl,
        }),
      },
      from: (table: string) => {
        if (table === "extracted_data") {
          return {
            // Select returns stale data
            select: (cols: string) => {
              if (cols === "id") {
                return {
                  eq: () => Promise.resolve({
                    data: [{ id: "stale-ed-1" }],
                    error: null,
                  }),
                };
              }
              // For insert().select().single()
              return {
                single: () => Promise.resolve({ data: { id: "ed-uuid-1" }, error: null }),
              };
            },
            insert: (data: unknown) => {
              mockExtractedDataInsert(data);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "ed-uuid-1" }, error: null }),
                }),
              };
            },
            delete: () => {
              trackExtractedDataDelete();
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "extracted_line_items") {
          return {
            insert: (data: unknown) => {
              mockLineItemsInsert(data);
              return Promise.resolve({ error: null });
            },
            delete: () => {
              trackLineItemsDelete();
              return {
                in: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "invoices") {
          return {
            update: (data: unknown) => {
              mockInvoicesUpdate(data);
              return { eq: () => Promise.resolve({ error: null }) };
            },
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { retry_count: 0 }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    }),
  }));

  vi.resetModules();
  const { runExtraction: runExtractionFresh } = await import("./run");

  const result = await runExtractionFresh(BASE_PARAMS);
  expect(result).toEqual(MOCK_RESULT);
  expect(trackLineItemsDelete).toHaveBeenCalled();
  expect(trackExtractedDataDelete).toHaveBeenCalled();

  vi.resetModules();
});
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat: clean up stale extraction data before re-extracting (DOC-18)"
```

## Chunk 2: Retry Route

### Task 4: Build the retry route with TDD

**Files:**
- Create: `app/api/invoices/[id]/retry/route.test.ts`
- Modify: `app/api/invoices/[id]/retry/route.ts`

- [ ] **Step 1: Write the full test file**

Create `app/api/invoices/[id]/retry/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockInvoiceSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockInvoiceSelect,
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

// Admin client mock (status update only — runExtraction is fully mocked)
const mockAdminUpdate = vi.fn();

const mockAdminClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: mockAdminUpdate,
    })),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// runExtraction mock
const mockRunExtraction = vi.fn();
vi.mock("@/lib/extraction/run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

// Logger mock
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Helpers
function makeRequest(invoiceId = "inv-1") {
  return {
    request: new Request(`http://localhost/api/invoices/${invoiceId}/retry`, {
      method: "POST",
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
  status: "error",
  file_path: "org-1/inv-1/invoice.pdf",
  file_type: "application/pdf",
  retry_count: 1,
};

const fakeExtractionResult = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-03-01",
    dueDate: "2026-03-31",
    subtotal: 100.0,
    taxAmount: 10.0,
    totalAmount: 110.0,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [],
  },
  rawResponse: {},
  modelVersion: "claude-sonnet-4-6",
  durationMs: 3800,
};

describe("POST /api/invoices/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpdate.mockResolvedValue({ error: null });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 404 when invoice is not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when invoice is not in error status", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "pending_review" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.error).toContain("not in an error state");
  });

  it("returns 422 when max retries exhausted", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, retry_count: 3 },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("UNPROCESSABLE");
    expect(body.error).toContain("3 attempts");
    expect(body.error).toContain("manually");
  });

  it("returns 200 with extracted data on successful retry", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockRunExtraction.mockResolvedValue(fakeExtractionResult);

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      vendorName: "Acme Corp",
      totalAmount: 110.0,
    });
    expect(mockRunExtraction).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      orgId: "org-1",
      userId: "user-1",
      filePath: "org-1/inv-1/invoice.pdf",
      fileType: "application/pdf",
    });
  });

  it("returns 500 when extraction fails during retry", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockRunExtraction.mockRejectedValue(
      new Error("Extraction timed out. Please retry.")
    );

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toContain("timed out");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/invoices/\\[id\\]/retry/route.test.ts`
Expected: all tests fail (route returns 501 Not Implemented)

- [ ] **Step 3: Implement the retry route**

Replace `app/api/invoices/[id]/retry/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtraction } from "@/lib/extraction/run";
import {
  authError,
  notFound,
  conflict,
  unprocessableEntity,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

const MAX_RETRIES = 3;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const start = Date.now();

  // 1. Auth check
  const client = createClient();
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !user) {
    logger.warn("retry_route_unauthorized", { invoiceId, status: "error" });
    return authError();
  }

  logger.info("retry_route_start", {
    action: "retry",
    invoiceId,
    userId: user.id,
  });

  // 2. Ownership check via RLS
  const { data: invoice, error: invoiceErr } = await client
    .from("invoices")
    .select("id, org_id, status, file_path, file_type, retry_count")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    logger.warn("retry_route_not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Invoice not found");
  }

  // 3. Status guard — only error invoices can be retried
  if (invoice.status !== "error") {
    logger.warn("retry_route_wrong_status", {
      invoiceId,
      userId: user.id,
      orgId: invoice.org_id,
      currentStatus: invoice.status,
      status: "error",
    });
    return conflict("Invoice is not in an error state");
  }

  // 4. Max retry guard
  if (invoice.retry_count >= MAX_RETRIES) {
    logger.warn("retry_route_max_retries", {
      invoiceId,
      userId: user.id,
      orgId: invoice.org_id,
      retryCount: invoice.retry_count,
      status: "error",
    });
    return unprocessableEntity(
      "Extraction failed after 3 attempts. You can enter this invoice manually."
    );
  }

  // 5. Set status to extracting
  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ status: "extracting", error_message: null })
    .eq("id", invoiceId);

  // 6. Run extraction
  try {
    const result = await runExtraction({
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      filePath: invoice.file_path,
      fileType: invoice.file_type,
    });

    logger.info("retry_route_success", {
      action: "retry",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "success",
    });

    return apiSuccess(result.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Extraction failed";
    logger.error("retry_route_failed", {
      action: "retry",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      error: errorMessage,
      status: "error",
    });
    return internalError(errorMessage);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/invoices/\\[id\\]/retry/route.test.ts`
Expected: all 6 tests pass

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add app/api/invoices/\\[id\\]/retry/route.ts app/api/invoices/\\[id\\]/retry/route.test.ts
git commit -m "feat: implement retry extraction route with max retry guard (DOC-18)"
```

### Task 5: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: clean build

- [ ] **Step 3: Run completion self-check**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: all clean

- [ ] **Step 4: Create feature branch and push**

```bash
git checkout -b feature/DOC-18-extraction-error-handling
# Cherry-pick or rebase commits from dev if needed
git push -u origin feature/DOC-18-extraction-error-handling
```

- [ ] **Step 5: Create PR**

```bash
gh pr create --title "feat: extraction error handling and retry route (DOC-18)" --body "$(cat <<'EOF'
## Summary
- Implement `POST /api/invoices/[id]/retry` route with auth, ownership, status guard, and max retry (3) enforcement
- Add stale extraction data cleanup in `runExtraction()` to prevent unique constraint violations on retry
- Tighten error messages for storage failures to user-friendly text
- Add `unprocessableEntity()` (422) helper to error utilities

## Test plan
- [ ] Retry route: 6 test cases (auth, 404, wrong status, max retries, happy path, extraction failure)
- [ ] Updated `run.test.ts` assertions for new error messages
- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Deliver status report**
