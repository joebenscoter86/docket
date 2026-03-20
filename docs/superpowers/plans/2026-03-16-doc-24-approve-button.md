# DOC-24: Approve Button Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an approve button to the invoice review form that validates required fields, transitions status to `approved`, and redirects to the invoice list.

**Architecture:** The approve API route validates auth, ownership (RLS), status guard (`pending_review` only), and required fields (`vendor_name`, `total_amount`) before updating status via admin client. The frontend ApproveBar component renders at the bottom of ExtractionForm with a two-click confirmation pattern and inline success/error feedback.

**Tech Stack:** Next.js API routes, Supabase (server + admin clients), Vitest for tests, Tailwind CSS for styling.

---

## Chunk 1: API Route

### Task 1: Approve API Route Tests

**Files:**
- Create: `app/api/invoices/[id]/approve/route.test.ts`

- [ ] **Step 1: Write test file with all test cases**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockInvoiceSelect = vi.fn();
const mockExtractedDataSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockInvoiceSelect,
          })),
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockExtractedDataSelect,
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

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

function makeRequest(invoiceId = "inv-1") {
  return {
    request: new Request(`http://localhost/api/invoices/${invoiceId}/approve`, {
      method: "POST",
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
  status: "pending_review",
};

const fakeExtractedData = {
  id: "ed-1",
  invoice_id: "inv-1",
  vendor_name: "Acme Corp",
  total_amount: 110.0,
};

describe("POST /api/invoices/[id]/approve", () => {
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
    mockInvoiceSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when invoice is already approved", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "approved" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 409 when invoice is already synced", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "synced" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 400 when invoice status is not pending_review", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "extracting" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when extracted data does not exist", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("extracted data");
  });

  it("returns 400 when vendor_name is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: { ...fakeExtractedData, vendor_name: null },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("vendor_name");
  });

  it("returns 400 when total_amount is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: { ...fakeExtractedData, total_amount: null },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("total_amount");
  });

  it("returns 200 and updates status to approved on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("approved");
    expect(mockAdminClient.from).toHaveBeenCalledWith("invoices");
  });

  it("returns 500 when status update fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockAdminUpdate.mockResolvedValue({ error: { message: "db error" } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/invoices/\\[id\\]/approve/route.test.ts`
Expected: All tests FAIL because route returns 501 for everything.

- [ ] **Step 3: Commit test file**

```bash
git add app/api/invoices/\[id\]/approve/route.test.ts
git commit -m "test: add approve API route tests (DOC-24)"
```

### Task 2: Approve API Route Implementation

**Files:**
- Modify: `app/api/invoices/[id]/approve/route.ts` (replace 501 stub)

- [ ] **Step 1: Implement the approve route**

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authError,
  notFound,
  validationError,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(
  _request: Request,
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

  logger.info("invoice.approve.start", { invoiceId, userId: user.id });

  // 2. Fetch invoice (RLS verifies ownership)
  const { data: invoice, error: invoiceErr } = await client
    .from("invoices")
    .select("id, org_id, status")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    logger.warn("invoice.approve.not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Invoice not found");
  }

  // 3. Status guard
  if (invoice.status === "approved" || invoice.status === "synced") {
    return conflict(`Invoice is already ${invoice.status}`);
  }
  if (invoice.status !== "pending_review") {
    return validationError(
      `Invoice cannot be approved from status '${invoice.status}'`
    );
  }

  // 4. Fetch extracted data and validate required fields
  const { data: extractedData, error: edErr } = await client
    .from("extracted_data")
    .select("id, vendor_name, total_amount")
    .eq("invoice_id", invoiceId)
    .single();

  if (edErr || !extractedData) {
    logger.warn("invoice.approve.no_extracted_data", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("No extracted data found for this invoice");
  }

  // 5. Validate required fields
  const missingFields: string[] = [];
  if (!extractedData.vendor_name) missingFields.push("vendor_name");
  if (extractedData.total_amount === null || extractedData.total_amount === undefined) {
    missingFields.push("total_amount");
  }
  if (missingFields.length > 0) {
    return validationError(
      `Missing required fields: ${missingFields.join(", ")}`,
      { missingFields }
    );
  }

  // 6. Update invoice status to approved
  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("invoices")
    .update({ status: "approved" })
    .eq("id", invoiceId);

  if (updateErr) {
    logger.error("invoice.approve.update_failed", {
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "error",
      error: updateErr.message,
    });
    return internalError("Failed to update invoice status");
  }

  logger.info("invoice.approve.success", {
    invoiceId,
    orgId: invoice.org_id,
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ status: "approved" });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run app/api/invoices/\\[id\\]/approve/route.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/invoices/\[id\]/approve/route.ts
git commit -m "feat: implement approve API route (DOC-24)"
```

---

## Chunk 2: Frontend ApproveBar Component

### Task 3: ApproveBar Component

**Files:**
- Create: `components/invoices/ApproveBar.tsx`

- [ ] **Step 1: Create the ApproveBar component**

```tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

type ApproveBarState = "idle" | "confirming" | "submitting" | "approved";

interface ApproveBarProps {
  invoiceId: string;
  vendorName: string | number | null;
  totalAmount: string | number | null;
}

export default function ApproveBar({
  invoiceId,
  vendorName,
  totalAmount,
}: ApproveBarProps) {
  const router = useRouter();
  const [barState, setBarState] = useState<ApproveBarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  // Validation
  const missingFields: string[] = [];
  const vendorStr = String(vendorName ?? "").trim();
  if (!vendorStr) missingFields.push("vendor name");
  if (totalAmount === null || totalAmount === undefined || String(totalAmount).trim() === "") {
    missingFields.push("total amount");
  }
  const canApprove = missingFields.length === 0;

  const handleApprove = useCallback(async () => {
    if (barState === "idle") {
      // First click → enter confirming state
      setBarState("confirming");
      setErrorMessage(null);
      confirmTimer.current = setTimeout(() => {
        setBarState("idle");
      }, 3000);
      return;
    }

    if (barState === "confirming") {
      // Second click → fire API call
      if (confirmTimer.current) clearTimeout(confirmTimer.current);

      // Blur active element to trigger pending auto-saves
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      // Wait for auto-save to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      setBarState("submitting");
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
          method: "POST",
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "Failed to approve invoice");
        }

        setBarState("approved");
        // Redirect after showing success
        redirectTimer.current = setTimeout(() => {
          router.push("/invoices");
        }, 2000);
      } catch (err) {
        setBarState("idle");
        const message = err instanceof Error ? err.message : "Failed to approve invoice";
        setErrorMessage(message);
        // Auto-dismiss error after 5 seconds
        errorTimer.current = setTimeout(() => {
          setErrorMessage(null);
        }, 5000);
      }
    }
  }, [barState, invoiceId, router]);

  // Button config by state
  const buttonConfig = {
    idle: {
      label: "Approve Invoice",
      className: canApprove
        ? "bg-blue-600 text-white hover:bg-blue-700"
        : "bg-blue-300 text-white cursor-not-allowed",
      disabled: !canApprove,
    },
    confirming: {
      label: "Confirm Approval",
      className: "bg-green-600 text-white hover:bg-green-700",
      disabled: false,
    },
    submitting: {
      label: "Approving...",
      className: "bg-blue-400 text-white cursor-not-allowed",
      disabled: true,
    },
    approved: {
      label: "Approved",
      className: "bg-green-600 text-white cursor-not-allowed",
      disabled: true,
    },
  };

  const btn = buttonConfig[barState];

  return (
    <div className="bg-white px-6 py-4 flex items-center justify-between gap-4">
      {/* Left side: status message */}
      <div className="text-sm flex items-center gap-2 min-w-0">
        {barState === "approved" ? (
          <>
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-green-700">
              Invoice approved. Ready to sync to QuickBooks.
            </span>
          </>
        ) : errorMessage ? (
          <>
            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-red-700 truncate">{errorMessage}</span>
          </>
        ) : canApprove ? (
          <>
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-green-700">Ready to approve</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-amber-700">
              Missing: {missingFields.join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Right side: approve button */}
      <button
        type="button"
        onClick={handleApprove}
        disabled={btn.disabled}
        className={`${btn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
      >
        {barState === "submitting" && (
          <svg
            className="h-4 w-4 animate-spin"
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
        )}
        {barState === "approved" && (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {btn.label}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/invoices/ApproveBar.tsx
git commit -m "feat: add ApproveBar component (DOC-24)"
```

### Task 4: Integrate ApproveBar into ExtractionForm

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx`
- Modify: `components/invoices/ReviewLayout.tsx`

- [ ] **Step 1: Add `invoiceStatus` prop to ExtractionForm**

In `components/invoices/ExtractionForm.tsx`, update the interface and component signature:

```typescript
// Update ExtractionFormProps interface (line 14-17)
interface ExtractionFormProps {
  extractedData: ExtractedDataRow;
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
}
```

Add imports at top of file:

```typescript
import type { InvoiceStatus } from "@/lib/types/invoice";
import ApproveBar from "./ApproveBar";
```

Update component signature:

```typescript
export default function ExtractionForm({
  extractedData,
  invoiceId,
  invoiceStatus,
}: ExtractionFormProps) {
```

- [ ] **Step 2: Render ApproveBar at bottom of ExtractionForm**

After the Amounts section closing `</div>` (line 386), before the final closing `</div>` (line 387), add:

```tsx
      {/* Approve bar — only shown for pending_review invoices */}
      {invoiceStatus === "pending_review" && (
        <>
          <div className="border-t border-gray-200" />
          <ApproveBar
            invoiceId={invoiceId}
            vendorName={state.values.vendor_name}
            totalAmount={state.values.total_amount}
          />
        </>
      )}
```

- [ ] **Step 3: Pass invoiceStatus from ReviewLayout to ExtractionForm**

In `components/invoices/ReviewLayout.tsx`, update line 132 to pass the status:

```tsx
<ExtractionForm
  extractedData={extractedData}
  invoiceId={invoice.id}
  invoiceStatus={invoice.status}
/>
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 7: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/invoices/ExtractionForm.tsx components/invoices/ReviewLayout.tsx
git commit -m "feat: integrate ApproveBar into review form (DOC-24)"
```
