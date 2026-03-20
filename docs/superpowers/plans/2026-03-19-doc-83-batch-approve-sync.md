# DOC-83: Batch Approve + Batch Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch approve and batch sync endpoints + UI buttons to complete the batch workflow: Upload → Extract → Review → Approve All → Sync All.

**Architecture:** Batch approve is synchronous (DB-only). Batch sync is fire-and-forget via `waitUntil()` with sequential QBO processing. Both endpoints validate per-invoice and skip failures. Real-time progress via existing Supabase Realtime infrastructure.

**Tech Stack:** Next.js 14 API routes, Supabase (Postgres + Realtime), QuickBooks Online API, `@vercel/functions` waitUntil

**Spec:** `docs/superpowers/specs/2026-03-19-doc-83-batch-approve-sync-design.md`

---

## File Structure

**New files:**
- `app/api/invoices/batch/approve/route.ts` — Batch approve endpoint (~80 LOC)
- `app/api/invoices/batch/approve/route.test.ts` — Tests for batch approve
- `app/api/invoices/batch/sync/route.ts` — Batch sync endpoint (~130 LOC)
- `app/api/invoices/batch/sync/route.test.ts` — Tests for batch sync
- `lib/quickbooks/batch-sync.ts` — Extracted background sync logic (~80 LOC, testable without `waitUntil`)

**Modified files:**
- `components/invoices/BatchHeader.tsx` — Add Approve All + Sync All buttons with progress tracking
- `components/invoices/InvoiceList.tsx` — Pass `isQboConnected` to BatchHeader
- `app/(dashboard)/invoices/page.tsx` — Fetch QBO connection status, pass to InvoiceList

---

## Task 1: Batch Approve Endpoint

**Files:**
- Create: `app/api/invoices/batch/approve/route.ts`
- Test: `app/api/invoices/batch/approve/route.test.ts`

### Step 1: Write failing tests

- [ ] **Step 1a: Create test file with mocks and helpers**

```typescript
// app/api/invoices/batch/approve/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();

// Track calls by table for the server client
const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: mockMembershipSelect,
        })),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockInvoicesSelect = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockInvoicesUpdate = vi.fn();

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => {
            if (col === "batch_id") {
              return { eq: vi.fn(() => mockInvoicesSelect) };
            }
            return mockInvoicesSelect;
          }),
        })),
        update: vi.fn(() => ({
          in: mockInvoicesUpdate,
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          in: mockExtractedDataSelect,
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockCheckInvoiceAccess = vi.fn();
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "./route";

// --- Helpers ---

function makeRequest(body: Record<string, unknown> = { batch_id: "batch-1" }) {
  return new Request("http://localhost/api/invoices/batch/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeInvoices = [
  { id: "inv-1", org_id: "org-1", status: "pending_review", file_name: "invoice1.pdf" },
  { id: "inv-2", org_id: "org-1", status: "pending_review", file_name: "invoice2.pdf" },
  { id: "inv-3", org_id: "org-1", status: "approved", file_name: "invoice3.pdf" },
];

const fakeExtractedData = [
  { invoice_id: "inv-1", vendor_name: "Acme Corp", total_amount: 100 },
  { invoice_id: "inv-2", vendor_name: null, total_amount: 200 },
];

function setupSuccessMocks() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockMembershipSelect.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
  mockCheckInvoiceAccess.mockResolvedValue({ allowed: true });
  mockInvoicesSelect.mockResolvedValue({ data: fakeInvoices, error: null });
  mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
  mockInvoicesUpdate.mockResolvedValue({ error: null });
}

describe("POST /api/invoices/batch/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when batch_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockMembershipSelect.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
    mockCheckInvoiceAccess.mockResolvedValue({ allowed: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 402 when subscription is inactive", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockMembershipSelect.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
    mockCheckInvoiceAccess.mockResolvedValue({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: true,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
  });

  it("approves valid invoices and skips invalid ones", async () => {
    setupSuccessMocks();
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices).toHaveLength(1);
    expect(body.data.skippedInvoices[0].reason).toContain("vendor");
  });

  it("returns 0 approved when no pending_review invoices exist", async () => {
    setupSuccessMocks();
    mockInvoicesSelect.mockResolvedValue({
      data: [{ id: "inv-3", org_id: "org-1", status: "approved", file_name: "invoice3.pdf" }],
      error: null,
    });
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(0);
    expect(body.data.skipped).toBe(0);
  });

  it("rejects when invoices belong to different org", async () => {
    setupSuccessMocks();
    mockInvoicesSelect.mockResolvedValue({
      data: [{ id: "inv-1", org_id: "org-OTHER", status: "pending_review", file_name: "invoice1.pdf" }],
      error: null,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 1b: Run tests to verify they fail**

```bash
npx vitest run app/api/invoices/batch/approve/route.test.ts
```

Expected: FAIL — `./route` module not found.

### Step 2: Implement batch approve endpoint

- [ ] **Step 2a: Create the route handler**

```typescript
// app/api/invoices/batch/approve/route.ts
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  validationError,
  forbiddenError,
  internalError,
  subscriptionRequired,
  apiSuccess,
} from "@/lib/utils/errors";

export async function POST(request: Request) {
  const start = Date.now();

  // 1. Auth
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return authError();

  // 2. Get org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return authError("No organization found.");
  const orgId = membership.org_id;

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    return subscriptionRequired("Subscription required.", {
      subscriptionStatus: access.subscriptionStatus,
      trialExpired: access.trialExpired,
    });
  }

  // 4. Parse and validate batch_id
  let body: { batch_id?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const batchId = body.batch_id;
  if (!batchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
    return validationError("batch_id is required and must be a valid UUID.");
  }

  logger.info("batch_approve.start", { action: "batch_approve", batchId, orgId, userId: user.id });

  const admin = createAdminClient();

  // 5. Fetch all invoices in batch, verify org ownership
  const { data: invoices, error: invErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_name")
    .eq("batch_id", batchId);

  if (invErr || !invoices) {
    return internalError("Failed to fetch batch invoices.");
  }

  // Verify ALL invoices belong to this org (Architecture Rule #10)
  const foreignInvoices = invoices.filter((inv: { org_id: string }) => inv.org_id !== orgId);
  if (foreignInvoices.length > 0) {
    logger.warn("batch_approve.org_mismatch", { batchId, orgId, foreignCount: foreignInvoices.length });
    return forbiddenError("Not authorized to approve invoices in this batch.");
  }

  // 6. Filter to pending_review only
  const candidates = invoices.filter((inv: { status: string }) => inv.status === "pending_review");

  if (candidates.length === 0) {
    logger.info("batch_approve.no_candidates", { batchId, orgId, totalInvoices: invoices.length });
    return apiSuccess({ approved: 0, skipped: 0, skippedInvoices: [] });
  }

  // 7. Fetch extracted data for candidates
  const candidateIds = candidates.map((inv: { id: string }) => inv.id);
  const { data: extractedRows } = await admin
    .from("extracted_data")
    .select("invoice_id, vendor_name, total_amount")
    .in("invoice_id", candidateIds);

  const extractedMap = new Map(
    (extractedRows ?? []).map((ed: { invoice_id: string; vendor_name: string | null; total_amount: number | null }) => [ed.invoice_id, ed])
  );

  // 8. Validate each candidate
  const toApprove: string[] = [];
  const skippedInvoices: Array<{ id: string; fileName: string; reason: string }> = [];

  for (const inv of candidates) {
    const ed = extractedMap.get(inv.id);
    const missing: string[] = [];

    if (!ed) {
      skippedInvoices.push({ id: inv.id, fileName: inv.file_name, reason: "No extracted data" });
      continue;
    }
    if (!ed.vendor_name) missing.push("vendor name");
    if (ed.total_amount === null || ed.total_amount === undefined) missing.push("total amount");

    if (missing.length > 0) {
      skippedInvoices.push({ id: inv.id, fileName: inv.file_name, reason: `Missing ${missing.join(", ")}` });
    } else {
      toApprove.push(inv.id);
    }
  }

  // 9. Bulk approve
  if (toApprove.length > 0) {
    const { error: updateErr } = await admin
      .from("invoices")
      .update({ status: "approved" })
      .in("id", toApprove);

    if (updateErr) {
      logger.error("batch_approve.update_failed", { batchId, orgId, error: updateErr.message });
      return internalError("Failed to approve invoices.");
    }
  }

  revalidatePath("/invoices");

  logger.info("batch_approve.complete", {
    action: "batch_approve_complete",
    batchId,
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    durationMs: Date.now() - start,
  });

  return apiSuccess({
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    skippedInvoices,
  });
}
```

- [ ] **Step 2b: Run tests to verify they pass**

```bash
npx vitest run app/api/invoices/batch/approve/route.test.ts
```

Expected: All tests pass.

- [ ] **Step 2c: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2d: Commit**

```bash
git add app/api/invoices/batch/approve/
git commit -m "feat(DOC-83): add batch approve endpoint with validation and skip logic"
```

---

## Task 2: Batch Sync Background Logic

**Files:**
- Create: `lib/quickbooks/batch-sync.ts`

Extract the background sync loop into a testable function separate from the route handler and `waitUntil`.

### Step 1: Write failing tests

- [ ] **Step 1a: Create test file**

```typescript
// lib/quickbooks/batch-sync.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetValidAccessToken = vi.fn();
vi.mock("@/lib/quickbooks/auth", () => ({
  getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
}));

const mockCreateBill = vi.fn();
const mockCreatePurchase = vi.fn();
const mockAttachPdfToEntity = vi.fn();
vi.mock("@/lib/quickbooks/api", () => ({
  createBill: (...args: unknown[]) => mockCreateBill(...args),
  createPurchase: (...args: unknown[]) => mockCreatePurchase(...args),
  attachPdfToEntity: (...args: unknown[]) => mockAttachPdfToEntity(...args),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    qboErrors: Array<{ Message: string; Detail: string; code: string; element?: string }>;
    faultType: string;
    constructor(statusCode: number, errors: Array<{ Message: string; Detail: string; code: string; element?: string }> = [], faultType = "unknown") {
      super(errors[0]?.Message ?? "Unknown");
      this.statusCode = statusCode;
      this.qboErrors = errors;
      this.faultType = faultType;
    }
    get errorCode() { return this.qboErrors[0]?.code ?? "unknown"; }
    get element() { return this.qboErrors[0]?.element; }
    get detail() { return this.qboErrors[0]?.Detail ?? this.message; }
  },
}));

const mockSyncLogSelect = vi.fn();
const mockSyncLogInsert = vi.fn();
const mockInvoiceUpdate = vi.fn();
const mockStorageDownload = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockLineItemsSelect = vi.fn();

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "sync_log") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: mockSyncLogSelect,
                  })),
                })),
              })),
            })),
          })),
        })),
        insert: mockSyncLogInsert,
      };
    }
    if (table === "invoices") {
      return {
        update: vi.fn(() => ({
          eq: mockInvoiceUpdate,
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
    if (table === "extracted_line_items") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: mockLineItemsSelect,
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
  storage: {
    from: vi.fn(() => ({
      download: mockStorageDownload,
    })),
  },
};

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { processBatchSync } from "./batch-sync";
import type { BatchSyncInvoice } from "./batch-sync";

const fakeInvoices: BatchSyncInvoice[] = [
  {
    id: "inv-1",
    org_id: "org-1",
    output_type: "bill",
    payment_account_id: null,
    file_path: "org-1/inv-1/invoice.pdf",
    file_name: "invoice1.pdf",
    retry_count: 0,
  },
  {
    id: "inv-2",
    org_id: "org-1",
    output_type: "check",
    payment_account_id: "bank-1",
    file_path: "org-1/inv-2/invoice.pdf",
    file_name: "invoice2.pdf",
    retry_count: 0,
  },
];

const fakeExtractedData = {
  id: "ed-1",
  vendor_name: "Acme",
  vendor_ref: "vendor-42",
  invoice_number: "INV-001",
  invoice_date: "2026-03-15",
  due_date: "2026-04-15",
};

const fakeLineItems = [
  { id: "li-1", amount: 150, gl_account_id: "acct-1", description: "Services", sort_order: 0 },
];

describe("processBatchSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetValidAccessToken.mockResolvedValue({ accessToken: "tok", companyId: "co-1" });
    mockSyncLogSelect.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockLineItemsSelect.mockResolvedValue({ data: fakeLineItems, error: null });
    mockSyncLogInsert.mockResolvedValue({ error: null });
    mockInvoiceUpdate.mockResolvedValue({ error: null });
    mockStorageDownload.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
    mockAttachPdfToEntity.mockResolvedValue({});
  });

  it("syncs all invoices sequentially and returns counts", async () => {
    mockCreateBill.mockResolvedValue({ Bill: { Id: "bill-1" } });
    mockCreatePurchase.mockResolvedValue({ Purchase: { Id: "purchase-1" } });

    const result = await processBatchSync(mockAdminClient as any, "org-1", "batch-1", [fakeInvoices[0]]);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("continues processing after individual invoice failure", async () => {
    mockCreateBill.mockRejectedValueOnce(new Error("QBO timeout"));
    mockCreateBill.mockResolvedValueOnce({ Bill: { Id: "bill-2" } });

    const twoInvoices = [fakeInvoices[0], { ...fakeInvoices[0], id: "inv-3" }];
    const result = await processBatchSync(mockAdminClient as any, "org-1", "batch-1", twoInvoices);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("skips already-synced invoices (idempotency)", async () => {
    mockSyncLogSelect.mockResolvedValue({ data: { provider_bill_id: "existing-1" }, error: null });

    const result = await processBatchSync(mockAdminClient as any, "org-1", "batch-1", [fakeInvoices[0]]);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skippedIdempotent).toBe(1);
    expect(mockCreateBill).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1b: Run tests to verify they fail**

```bash
npx vitest run lib/quickbooks/batch-sync.test.ts
```

Expected: FAIL — module not found.

### Step 2: Implement background sync logic

- [ ] **Step 2a: Create batch-sync.ts**

This file extracts the per-invoice sync logic into a loop that can be tested without `waitUntil`. It reuses the same bill/purchase creation, PDF attachment, and sync_log patterns from the single sync endpoint.

```typescript
// lib/quickbooks/batch-sync.ts
import { getValidAccessToken } from "@/lib/quickbooks/auth";
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";
import type { OutputType, ProviderEntityType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE } from "@/lib/types/invoice";

export interface BatchSyncInvoice {
  id: string;
  org_id: string;
  output_type: string | null;
  payment_account_id: string | null;
  file_path: string;
  file_name: string;
  retry_count: number;
}

export interface BatchSyncResult {
  synced: number;
  failed: number;
  skippedIdempotent: number;
  totalMs: number;
}

/**
 * Process a batch of invoices for QBO sync, sequentially.
 * Each invoice is independent — failures don't stop the batch.
 * Handles token refresh, idempotency, bill/purchase creation, PDF attachment.
 */
export async function processBatchSync(
  adminSupabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  batchId: string,
  invoices: BatchSyncInvoice[]
): Promise<BatchSyncResult> {
  const start = Date.now();
  let synced = 0;
  let failed = 0;
  let skippedIdempotent = 0;
  let backoffMs = 5000;
  const MAX_BACKOFF_MS = 60000;

  logger.info("batch_sync.processing_start", {
    action: "batch_sync_start",
    batchId,
    invoiceCount: invoices.length,
    orgId,
  });

  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    try {
      const outputType = (invoice.output_type ?? "bill") as OutputType;
      const isBill = outputType === "bill";
      const transactionType = outputType;
      const providerEntityType: ProviderEntityType = isBill ? "Bill" : "Purchase";

      // 1. Idempotency guard
      const { data: existingSync } = await adminSupabase
        .from("sync_log")
        .select("provider_bill_id")
        .eq("invoice_id", invoice.id)
        .eq("provider", "quickbooks")
        .eq("status", "success")
        .eq("transaction_type", transactionType)
        .limit(1)
        .single();

      if (existingSync?.provider_bill_id) {
        skippedIdempotent++;
        continue;
      }

      // 2. Get valid token (auto-refreshes if needed)
      await getValidAccessToken(adminSupabase, orgId);

      // 3. Load extracted data + line items
      const { data: extractedData } = await adminSupabase
        .from("extracted_data")
        .select("*")
        .eq("invoice_id", invoice.id)
        .single();

      if (!extractedData) {
        throw new Error("No extracted data found");
      }

      const { data: lineItems } = await adminSupabase
        .from("extracted_line_items")
        .select("*")
        .eq("extracted_data_id", extractedData.id)
        .order("sort_order", { ascending: true });

      if (!lineItems || lineItems.length === 0) {
        throw new Error("No line items found");
      }

      // 4. Create bill/purchase
      let entityId: string;
      let requestPayload: unknown;
      let responsePayload: unknown;

      if (isBill) {
        const billLines: QBOBillLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
          DetailType: "AccountBasedExpenseLineDetail" as const,
          Amount: Number(li.amount),
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: li.gl_account_id },
          },
          ...(li.description ? { Description: li.description } : {}),
        }));

        const billPayload: QBOBillPayload = {
          VendorRef: { value: extractedData.vendor_ref },
          Line: billLines,
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.due_date ? { DueDate: extractedData.due_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = billPayload;
        const billResponse = await createBill(adminSupabase, orgId, billPayload);
        entityId = billResponse.Bill.Id;
        responsePayload = billResponse;
      } else {
        const purchaseLines: QBOPurchaseLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
          Amount: Number(li.amount),
          DetailType: "AccountBasedExpenseLineDetail" as const,
          Description: li.description ?? undefined,
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: li.gl_account_id },
          },
        }));

        const paymentType = OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">];

        const purchasePayload: QBOPurchasePayload = {
          PaymentType: paymentType as "Check" | "Cash" | "CreditCard",
          AccountRef: { value: invoice.payment_account_id! },
          EntityRef: { value: extractedData.vendor_ref, type: "Vendor" },
          Line: purchaseLines,
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = purchasePayload;
        const purchaseResponse = await createPurchase(adminSupabase, orgId, purchasePayload);
        entityId = purchaseResponse.Purchase.Id;
        responsePayload = purchaseResponse;
      }

      // 5. Log success in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoice.id,
        provider: "quickbooks",
        provider_bill_id: entityId,
        request_payload: requestPayload as Record<string, unknown>,
        provider_response: responsePayload as Record<string, unknown>,
        status: "success",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
      });

      // 6. Attach PDF (best-effort)
      try {
        const { data: fileData, error: downloadError } = await adminSupabase
          .storage
          .from("invoices")
          .download(invoice.file_path);

        if (!downloadError && fileData) {
          const fileBuffer = Buffer.from(await fileData.arrayBuffer());
          await attachPdfToEntity(adminSupabase, orgId, entityId, providerEntityType, fileBuffer, invoice.file_name);
        }
      } catch (attachErr) {
        logger.warn("batch_sync.attachment_failed", {
          invoiceId: invoice.id,
          batchId,
          error: attachErr instanceof Error ? attachErr.message : "Unknown",
        });
      }

      // 7. Update invoice status to synced
      await adminSupabase
        .from("invoices")
        .update({ status: "synced", error_message: null })
        .eq("id", invoice.id);

      synced++;
      backoffMs = 5000; // Reset backoff on success

    } catch (error) {
      // Handle QBO rate limiting — retry after backoff
      if (error instanceof QBOApiError && error.statusCode === 429) {
        logger.warn("batch_sync.rate_limited", {
          action: "batch_sync_rate_limited",
          batchId,
          invoiceId: invoice.id,
          waitSeconds: backoffMs / 1000,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        // Retry this invoice by rewinding the loop index
        i--;
        continue;
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetail = error instanceof QBOApiError
        ? { code: error.errorCode, element: error.element, detail: error.detail, faultType: error.faultType }
        : {};

      // Log failure in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoice.id,
        provider: "quickbooks",
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
        transaction_type: (invoice.output_type ?? "bill"),
        provider_entity_type: ((invoice.output_type ?? "bill") === "bill" ? "Bill" : "Purchase") as ProviderEntityType,
      });

      // Update invoice with error
      await adminSupabase
        .from("invoices")
        .update({
          status: "error",
          error_message: `Sync failed: ${errorMessage}`,
        })
        .eq("id", invoice.id);

      logger.error("batch_sync.invoice_failed", {
        invoiceId: invoice.id,
        batchId,
        error: errorMessage,
        ...errorDetail,
      });

      failed++;
    }
  }

  const totalMs = Date.now() - start;

  logger.info("batch_sync.processing_complete", {
    action: "batch_sync_complete",
    batchId,
    synced,
    failed,
    skippedIdempotent,
    totalMs,
  });

  return { synced, failed, skippedIdempotent, totalMs };
}
```

- [ ] **Step 2b: Run tests to verify they pass**

```bash
npx vitest run lib/quickbooks/batch-sync.test.ts
```

- [ ] **Step 2c: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2d: Commit**

```bash
git add lib/quickbooks/batch-sync.ts lib/quickbooks/batch-sync.test.ts
git commit -m "feat(DOC-83): add batch sync background processing logic"
```

---

## Task 3: Batch Sync Endpoint

**Files:**
- Create: `app/api/invoices/batch/sync/route.ts`
- Test: `app/api/invoices/batch/sync/route.test.ts`

### Step 1: Write failing tests

- [ ] **Step 1a: Create test file**

The route test focuses on the synchronous part (validation, pre-flight, returning immediately). Background processing is tested in Task 2.

```typescript
// app/api/invoices/batch/sync/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock waitUntil to capture the background work
const mockWaitUntil = vi.fn();
vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => mockWaitUntil(p),
}));

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: mockMembershipSelect,
        })),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockInvoicesSelect = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockLineItemsSelect = vi.fn();

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string) => {
            if (col === "batch_id") {
              return { eq: vi.fn(() => mockInvoicesSelect) };
            }
            return mockInvoicesSelect;
          }),
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          in: mockExtractedDataSelect,
        })),
      };
    }
    if (table === "extracted_line_items") {
      return {
        select: vi.fn(() => ({
          in: mockLineItemsSelect,  // .in("extracted_data_id", edIds)
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockIsConnected = vi.fn();
vi.mock("@/lib/quickbooks/auth", () => ({
  isConnected: (...args: unknown[]) => mockIsConnected(...args),
}));

const mockCheckInvoiceAccess = vi.fn();
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

vi.mock("@/lib/quickbooks/batch-sync", () => ({
  processBatchSync: vi.fn().mockResolvedValue({ synced: 0, failed: 0, skippedIdempotent: 0, totalMs: 0 }),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown> = { batch_id: "batch-1" }) {
  return new Request("http://localhost/api/invoices/batch/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeInvoices = [
  {
    id: "inv-1", org_id: "org-1", status: "approved", file_name: "invoice1.pdf",
    file_path: "org-1/inv-1/invoice.pdf", output_type: "bill",
    payment_account_id: null, retry_count: 0,
  },
];

const fakeExtractedData = [
  { id: "ed-1", invoice_id: "inv-1", vendor_ref: "vendor-42" },
];

const fakeLineItems = [
  { extracted_data_id: "ed-1", gl_account_id: "acct-1" },
];

function setupSuccessMocks() {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockMembershipSelect.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
  mockCheckInvoiceAccess.mockResolvedValue({ allowed: true });
  mockIsConnected.mockResolvedValue(true);
  mockInvoicesSelect.mockResolvedValue({ data: fakeInvoices, error: null });
  mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
  mockLineItemsSelect.mockResolvedValue({ data: fakeLineItems, error: null });
}

describe("POST /api/invoices/batch/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when batch_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockMembershipSelect.mockResolvedValue({ data: { org_id: "org-1" }, error: null });
    mockCheckInvoiceAccess.mockResolvedValue({ allowed: true });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no QBO connection", async () => {
    setupSuccessMocks();
    mockIsConnected.mockResolvedValue(false);
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("QuickBooks");
  });

  it("returns syncing count and fires waitUntil on success", async () => {
    setupSuccessMocks();
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.invoiceIds).toEqual(["inv-1"]);
    expect(mockWaitUntil).toHaveBeenCalledOnce();
  });

  it("skips invoices missing vendor_ref in pre-flight", async () => {
    setupSuccessMocks();
    mockExtractedDataSelect.mockResolvedValue({
      data: [{ id: "ed-1", invoice_id: "inv-1", vendor_ref: null }],
      error: null,
    });
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(0);
    expect(body.data.skipped).toBe(1);
  });

  it("skips invoices with unmapped GL accounts on line items", async () => {
    setupSuccessMocks();
    mockLineItemsSelect.mockResolvedValue({
      data: [{ extracted_data_id: "ed-1", gl_account_id: null }],
      error: null,
    });
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].reason).toContain("GL account");
  });

  it("skips invoices with no line items", async () => {
    setupSuccessMocks();
    mockLineItemsSelect.mockResolvedValue({ data: [], error: null });
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(0);
    expect(body.data.skippedInvoices[0].reason).toContain("No line items");
  });
});
```

- [ ] **Step 1b: Run tests to verify they fail**

```bash
npx vitest run app/api/invoices/batch/sync/route.test.ts
```

Expected: FAIL — module not found.

### Step 2: Implement batch sync endpoint

- [ ] **Step 2a: Create the route handler**

```typescript
// app/api/invoices/batch/sync/route.ts
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { processBatchSync } from "@/lib/quickbooks/batch-sync";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  validationError,
  forbiddenError,
  internalError,
  subscriptionRequired,
  apiSuccess,
} from "@/lib/utils/errors";

export async function POST(request: Request) {
  // 1. Auth
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return authError();

  // 2. Get org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return authError("No organization found.");
  const orgId = membership.org_id;

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    return subscriptionRequired("Subscription required.", {
      subscriptionStatus: access.subscriptionStatus,
      trialExpired: access.trialExpired,
    });
  }

  // 4. Parse and validate batch_id
  let body: { batch_id?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const batchId = body.batch_id;
  if (!batchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
    return validationError("batch_id is required and must be a valid UUID.");
  }

  const admin = createAdminClient();

  // 5. Check QBO connection
  const connected = await isConnected(admin, orgId);
  if (!connected) {
    return validationError("Connect QuickBooks in Settings first.");
  }

  // 6. Fetch all invoices in batch, verify org ownership
  const { data: allInvoices, error: invErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_name, file_path, output_type, payment_account_id, retry_count")
    .eq("batch_id", batchId);

  if (invErr || !allInvoices) {
    return internalError("Failed to fetch batch invoices.");
  }

  const foreignInvoices = allInvoices.filter((inv: { org_id: string }) => inv.org_id !== orgId);
  if (foreignInvoices.length > 0) {
    return forbiddenError("Not authorized to sync invoices in this batch.");
  }

  // 7. Filter to approved only
  const approvedInvoices = allInvoices.filter((inv: { status: string }) => inv.status === "approved");

  if (approvedInvoices.length === 0) {
    return apiSuccess({ syncing: 0, skipped: 0, skippedInvoices: [], invoiceIds: [] });
  }

  // 8. Pre-flight validation: check extracted_data for required fields
  const approvedIds = approvedInvoices.map((inv: { id: string }) => inv.id);

  const { data: extractedRows } = await admin
    .from("extracted_data")
    .select("id, invoice_id, vendor_ref")
    .in("invoice_id", approvedIds);

  const edMap = new Map(
    (extractedRows ?? []).map((ed: { id: string; invoice_id: string; vendor_ref: string | null }) => [ed.invoice_id, ed])
  );

  // extracted_line_items joins through extracted_data_id, not invoice_id
  const edIds = (extractedRows ?? []).map((ed: { id: string }) => ed.id);
  const { data: lineItemRows } = edIds.length > 0
    ? await admin
        .from("extracted_line_items")
        .select("extracted_data_id, gl_account_id")
        .in("extracted_data_id", edIds)
    : { data: [] };

  const lineItemsByEdId = new Map<string, Array<{ gl_account_id: string | null }>>();
  if (lineItemRows) {
    for (const li of lineItemRows as Array<{ extracted_data_id: string; gl_account_id: string | null }>) {
      const existing = lineItemsByEdId.get(li.extracted_data_id) ?? [];
      existing.push(li);
      lineItemsByEdId.set(li.extracted_data_id, existing);
    }
  }

  const toSync: typeof approvedInvoices = [];
  const skippedInvoices: Array<{ id: string; fileName: string; reason: string }> = [];

  for (const inv of approvedInvoices) {
    const ed = edMap.get(inv.id);
    const reasons: string[] = [];

    if (!ed || !ed.vendor_ref) {
      reasons.push("No QuickBooks vendor mapped");
    }

    if (ed) {
      const edLineItems = lineItemsByEdId.get(ed.id) ?? [];
      if (edLineItems.length === 0) {
        reasons.push("No line items");
      } else {
        const unmapped = edLineItems.filter((li) => !li.gl_account_id);
        if (unmapped.length > 0) {
          reasons.push("Line items missing GL account mapping");
        }
      }
    }

    // For non-bill types, check payment_account_id
    const outputType = inv.output_type ?? "bill";
    if (outputType !== "bill" && !inv.payment_account_id) {
      reasons.push("Missing payment account for check/cash sync");
    }

    if (reasons.length > 0) {
      skippedInvoices.push({ id: inv.id, fileName: inv.file_name, reason: reasons.join("; ") });
    } else {
      toSync.push(inv);
    }
  }

  const invoiceIds = toSync.map((inv: { id: string }) => inv.id);

  logger.info("batch_sync.start", {
    action: "batch_sync_start",
    batchId,
    invoiceCount: allInvoices.length,
    syncing: toSync.length,
    skipped: skippedInvoices.length,
    orgId,
    userId: user.id,
  });

  // 9. Fire-and-forget via waitUntil
  if (toSync.length > 0) {
    waitUntil(processBatchSync(admin, orgId, batchId, toSync));
  }

  return apiSuccess({
    syncing: toSync.length,
    skipped: skippedInvoices.length,
    skippedInvoices,
    invoiceIds,
  });
}
```

- [ ] **Step 2b: Run tests to verify they pass**

```bash
npx vitest run app/api/invoices/batch/sync/route.test.ts
```

- [ ] **Step 2c: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2d: Commit**

```bash
git add app/api/invoices/batch/sync/ lib/quickbooks/batch-sync.ts lib/quickbooks/batch-sync.test.ts
git commit -m "feat(DOC-83): add batch sync endpoint with fire-and-forget processing"
```

---

## Task 4: BatchHeader UI — Approve All + Sync All Buttons

**Files:**
- Modify: `components/invoices/BatchHeader.tsx`
- Modify: `components/invoices/InvoiceList.tsx`
- Modify: `app/(dashboard)/invoices/page.tsx`

### Step 1: Pass isQboConnected through the component tree

- [ ] **Step 1a: Update invoices page to fetch QBO connection status**

In `app/(dashboard)/invoices/page.tsx`, add a server-side check for QBO connection and pass it to `InvoiceList`.

Add after the `fetchInvoiceCounts` call:

```typescript
// Import at top
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";

// After the user check, get the org
const { data: membership } = await supabase
  .from("org_memberships")
  .select("org_id")
  .eq("user_id", user.id)
  .limit(1)
  .single();

// Add to the Promise.all or fetch separately
const isQboConnected = membership ? await isConnected(createAdminClient(), membership.org_id) : false;
```

Pass to InvoiceList: `isQboConnected={isQboConnected}`

- [ ] **Step 1b: Update InvoiceList props and pass to BatchHeader**

Add `isQboConnected?: boolean` to `InvoiceListProps` interface. Pass it through to `<BatchHeader isQboConnected={isQboConnected} />`.

- [ ] **Step 1c: Run typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 1d: Commit**

```bash
git add app/(dashboard)/invoices/page.tsx components/invoices/InvoiceList.tsx
git commit -m "feat(DOC-83): pass QBO connection status to BatchHeader"
```

### Step 2: Add Approve All and Sync All buttons to BatchHeader

- [ ] **Step 2a: Update BatchHeader with new props and handlers**

Update imports at top of file:
```typescript
import { useState, useEffect, useMemo } from "react";
```

Add to `BatchHeaderProps`:
```typescript
isQboConnected?: boolean;
```

Add state variables:
```typescript
const [isApproving, setIsApproving] = useState(false);
const [approveResult, setApproveResult] = useState<{
  approved: number;
  skipped: number;
  skippedInvoices: Array<{ id: string; fileName: string; reason: string }>;
} | null>(null);
const [showSkippedDetails, setShowSkippedDetails] = useState(false);

const [isSyncing, setIsSyncing] = useState(false);
const [syncingInvoiceIds, setSyncingInvoiceIds] = useState<string[]>([]);
const [syncComplete, setSyncComplete] = useState(false);
const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
```

Add handler for Approve All:
```typescript
const handleApproveAll = async (e: React.MouseEvent) => {
  e.stopPropagation();
  if (isApproving) return;

  setIsApproving(true);
  setApproveResult(null);

  try {
    const res = await fetch("/api/invoices/batch/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    const body = await res.json();

    if (res.ok) {
      setApproveResult(body.data);
      setTimeout(() => setApproveResult(null), 8000);
    }
  } catch {
    // Network error — swallow, user can retry
  }

  setIsApproving(false);
  router.refresh();
};
```

Add handler for Sync All:
```typescript
const handleSyncAll = async (e: React.MouseEvent) => {
  e.stopPropagation();
  if (isSyncing) return;

  setIsSyncing(true);
  setSyncComplete(false);
  setSyncResult(null);

  try {
    const res = await fetch("/api/invoices/batch/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    const body = await res.json();

    if (res.ok && body.data.invoiceIds.length > 0) {
      setSyncingInvoiceIds(body.data.invoiceIds);
    } else {
      setIsSyncing(false);
    }
  } catch {
    setIsSyncing(false);
  }
};
```

Add the buttons to the action buttons `<div>` (after "Retry All Failed" and before "Review Next"):
```tsx
{/* Approve All Ready */}
{summary.readyForReview > 0 && (
  <button
    type="button"
    onClick={handleApproveAll}
    disabled={isApproving}
    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
  >
    {isApproving ? (
      <>
        {/* Spinner SVG (same as retry spinner) */}
        Approving&hellip;
      </>
    ) : (
      <>Approve {summary.readyForReview} Ready</>
    )}
  </button>
)}

{/* Sync All to QuickBooks */}
{summary.approved > 0 && isQboConnected && (
  <button
    type="button"
    onClick={handleSyncAll}
    disabled={isSyncing}
    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
  >
    {isSyncing ? (
      <>
        {/* Spinner SVG */}
        Syncing&hellip;
      </>
    ) : (
      <>Sync {summary.approved} to QuickBooks</>
    )}
  </button>
)}
```

Add result banners (below the retry result banner):
```tsx
{/* Approve result banner */}
{approveResult !== null && (
  <div className="mb-2 rounded-md px-4 py-2 text-sm font-medium" style={{ color: "#065F46", backgroundColor: "#D1FAE5" }}>
    {approveResult.approved} approved{approveResult.skipped > 0 && <>, {approveResult.skipped} skipped</>}
    {approveResult.skippedInvoices.length > 0 && (
      <button
        type="button"
        onClick={() => setShowSkippedDetails(!showSkippedDetails)}
        className="ml-2 text-green-700 underline"
      >
        {showSkippedDetails ? "Hide details" : "Show details"}
      </button>
    )}
    {showSkippedDetails && (
      <ul className="mt-1 text-xs text-gray-600">
        {approveResult.skippedInvoices.map((s) => (
          <li key={s.id}>{s.fileName}: {s.reason}</li>
        ))}
      </ul>
    )}
  </div>
)}
```

- [ ] **Step 2b: Add sync progress tracking via useInvoiceStatuses**

Import `useInvoiceStatuses` and track progress when `syncingInvoiceIds` is populated:

```typescript
import { useInvoiceStatuses } from "@/lib/hooks/useInvoiceStatuses";

// Inside the component:
const { statuses: realtimeStatuses } = useInvoiceStatuses(syncingInvoiceIds);

// Derive progress
const syncProgress = useMemo(() => {
  if (syncingInvoiceIds.length === 0) return null;
  let synced = 0;
  let failed = 0;
  for (const id of syncingInvoiceIds) {
    const s = realtimeStatuses[id];
    if (s?.status === "synced") synced++;
    else if (s?.status === "error") failed++;
  }
  return { synced, failed, total: syncingInvoiceIds.length, done: synced + failed === syncingInvoiceIds.length };
}, [syncingInvoiceIds, realtimeStatuses]);

// Detect completion
useEffect(() => {
  if (syncProgress?.done && !syncComplete) {
    setSyncComplete(true);
    setIsSyncing(false);
    setSyncResult({ synced: syncProgress.synced, failed: syncProgress.failed });
    setSyncingInvoiceIds([]);
    setTimeout(() => setSyncResult(null), 8000);
    router.refresh();
  }
}, [syncProgress, syncComplete, router]);
```

Update the sync button text to show progress when syncing:
```tsx
{isSyncing && syncProgress ? (
  <>{syncProgress.synced} of {syncProgress.total} synced&hellip;</>
) : isSyncing ? (
  <>Syncing&hellip;</>
) : (
  <>Sync {summary.approved} to QuickBooks</>
)}
```

Add sync result banner:
```tsx
{syncResult !== null && (
  <div className="mb-2 rounded-md px-4 py-2 text-sm font-medium" style={{
    color: syncResult.failed > 0 ? "#92400E" : "#065F46",
    backgroundColor: syncResult.failed > 0 ? "#FEF3C7" : "#D1FAE5",
  }}>
    {syncResult.synced} synced to QuickBooks{syncResult.failed > 0 && <>, {syncResult.failed} failed</>}
  </div>
)}
```

- [ ] **Step 2c: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2d: Run all tests**

```bash
npm run test
```

- [ ] **Step 2e: Commit**

```bash
git add components/invoices/BatchHeader.tsx
git commit -m "feat(DOC-83): add Approve All and Sync All buttons to BatchHeader with progress tracking"
```

---

## Task 5: Batch Completion Banner

**Files:**
- Modify: `components/invoices/BatchHeader.tsx`

### Step 1: Add completion banner

- [ ] **Step 1a: Add banner when all invoices are synced**

In `BatchHeader`, check if the entire batch is synced:

```typescript
const allSynced = invoices.length > 0 && invoices.every((inv) => inv.status === "synced");
```

Render at top of the BatchHeader component (before the main header row):

```tsx
{allSynced && (
  <div
    className="mb-2 flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium"
    style={{ color: "#065F46", backgroundColor: "#D1FAE5" }}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
    Batch complete &mdash; {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} synced to QuickBooks
  </div>
)}
```

- [ ] **Step 1b: Run lint and typecheck**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 1c: Run full test suite**

```bash
npm run test
```

- [ ] **Step 1d: Run build**

```bash
npm run build
```

- [ ] **Step 1e: Commit**

```bash
git add components/invoices/BatchHeader.tsx
git commit -m "feat(DOC-83): add batch completion banner when all invoices synced"
```

---

## Task 6: Final Verification

- [ ] **Step 6a: Run completion self-check**

```bash
npm run lint
npm run build
npx tsc --noEmit
npm run test
```

All must pass clean.

- [ ] **Step 6b: Verify no `any` types in new code**

```bash
grep -r ":\s*any" app/api/invoices/batch/ lib/quickbooks/batch-sync.ts --include="*.ts" | grep -v ".test.ts" | grep -v "node_modules"
```

- [ ] **Step 6c: Verify no console.log in new code**

```bash
grep -r "console\." app/api/invoices/batch/ lib/quickbooks/batch-sync.ts components/invoices/BatchHeader.tsx --include="*.ts" --include="*.tsx" | grep -v ".test."
```

- [ ] **Step 6d: Create feature branch and push**

```bash
git checkout -b feature/DOC-83-batch-approve-sync
git push -u origin feature/DOC-83-batch-approve-sync
```

- [ ] **Step 6e: Create PR**

```bash
gh pr create --title "DOC-83: Batch approve + batch sync to QuickBooks" --body "$(cat <<'EOF'
## Summary
- Batch approve endpoint: validates and approves all `pending_review` invoices in a batch, skipping those missing required fields
- Batch sync endpoint: fire-and-forget via `waitUntil()`, sequential QBO processing with per-invoice error isolation
- UI: "Approve N Ready" and "Sync N to QuickBooks" buttons in BatchHeader with real-time progress tracking
- Batch completion banner when all invoices reach `synced` status

## Test plan
- [ ] Batch approve: verify all pending_review invoices get approved
- [ ] Batch approve: verify invoices missing vendor_name/total_amount are skipped with reasons
- [ ] Batch sync: verify fire-and-forget returns immediately with syncing count
- [ ] Batch sync: verify per-invoice status updates via Realtime
- [ ] Batch sync: verify individual failures don't stop the batch
- [ ] Batch sync: verify invoices without vendor_ref are skipped in pre-flight
- [ ] UI: Approve All button shows count and disables on click
- [ ] UI: Sync All button shows progress ("12 of 15 synced...")
- [ ] UI: Completion banner appears when all invoices synced
- [ ] No QBO connection: Sync button hidden

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6f: Deliver status report**
