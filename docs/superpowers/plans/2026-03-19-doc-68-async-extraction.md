# DOC-68: Async Extraction Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple upload from extraction so uploads return immediately, extraction runs in the background with concurrency control (5 concurrent max), and add `batch_id` column for future multi-file upload grouping.

**Architecture:** Upload route creates invoice with `status = 'uploaded'` and returns immediately. A new `enqueueExtraction()` function wraps `runExtraction()` with `p-limit(5)` concurrency control. The existing `useInvoiceStatus` hook is extended to support multi-invoice Realtime subscriptions. Single-file upload uses the same async path — no separate code path.

**Tech Stack:** Next.js 14, Supabase (Postgres + Realtime), p-limit, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-batch-upload-design.md`
**Linear:** DOC-68

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260319400000_add_uploaded_status_and_batch_id.sql` | Create | Add `uploaded` status to CHECK constraint, add `batch_id` column + index |
| `lib/types/invoice.ts` | Modify | Add `'uploaded'` to `InvoiceStatus` union |
| `components/invoices/InvoiceStatusBadge.tsx` | Modify | Add `uploaded` status config entry |
| `lib/extraction/queue.ts` | Create | `enqueueExtraction()` — p-limit(5) concurrency wrapper around `runExtraction()` |
| `lib/extraction/queue.test.ts` | Create | Tests for concurrency queue |
| `lib/extraction/run.ts` | Modify | Add double-extraction guard (skip if already `extracting`) |
| `lib/extraction/run.test.ts` | Modify | Add test for double-extraction guard |
| `app/api/invoices/upload/route.ts` | Modify | Accept `batch_id`, insert with `status='uploaded'`, call `enqueueExtraction()` via `waitUntil()`, cleanup orphaned storage on DB failure |
| `app/api/invoices/upload/route.test.ts` | Modify | Update tests for new flow + add batch_id and orphan cleanup tests |
| `lib/hooks/useInvoiceStatus.ts` | Modify | Add multi-invoice overload returning `Record<string, {status, errorMessage}>` |
| `lib/hooks/useInvoiceStatuses.ts` | Create | Multi-invoice Realtime subscription hook |
| `lib/hooks/useInvoiceStatuses.test.ts` | Create | Tests for multi-invoice hook |

---

## Task 1: Database Migration — Add `uploaded` Status and `batch_id`

**Files:**
- Create: `supabase/migrations/20260319400000_add_uploaded_status_and_batch_id.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add 'uploaded' status to invoice status enum and add batch_id column
-- 'uploaded' means file is in Storage, extraction hasn't started yet

-- Drop and re-add CHECK constraint to include 'uploaded'
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('uploading', 'uploaded', 'extracting', 'pending_review', 'approved', 'synced', 'error'));

-- Add batch_id column (nullable — single-file uploads have NULL)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Index for batch grouping queries
CREATE INDEX IF NOT EXISTS idx_invoices_batch_id ON invoices(batch_id);
```

- [ ] **Step 2: Apply migration to dev database**

Run: `npx supabase db push` or apply via Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319400000_add_uploaded_status_and_batch_id.sql
git commit -m "feat: add uploaded status and batch_id column to invoices (DOC-68)"
```

---

## Task 2: Update `InvoiceStatus` Type and Status Badge

**Files:**
- Modify: `lib/types/invoice.ts:1-7`
- Modify: `components/invoices/InvoiceStatusBadge.tsx:12-46`

- [ ] **Step 1: Add `uploaded` to `InvoiceStatus` type**

In `lib/types/invoice.ts`, add `"uploaded"` to the union:

```typescript
export type InvoiceStatus =
  | "uploading"
  | "uploaded"
  | "extracting"
  | "pending_review"
  | "approved"
  | "synced"
  | "error";
```

- [ ] **Step 2: Add `uploaded` to InvoiceStatusBadge config**

In `components/invoices/InvoiceStatusBadge.tsx`, add an entry for `uploaded` in the `statusConfig` record, right after `uploading`:

```typescript
uploaded: {
  label: 'Uploaded',
  textColor: 'text-[#1E40AF]',
  bgColor: 'bg-[#DBEAFE]',
  dotAnimation: 'animate-pulse',
},
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. The `Record<InvoiceStatus, ...>` in InvoiceStatusBadge enforces that all statuses have config entries.

- [ ] **Step 4: Commit**

```bash
git add lib/types/invoice.ts components/invoices/InvoiceStatusBadge.tsx
git commit -m "feat: add uploaded status to InvoiceStatus type and badge (DOC-68)"
```

---

## Task 3: Build Extraction Concurrency Queue

**Files:**
- Create: `lib/extraction/queue.ts`
- Create: `lib/extraction/queue.test.ts`

- [ ] **Step 1: Write tests for the extraction queue**

Create `lib/extraction/queue.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock runExtraction before importing queue
const mockRunExtraction = vi.fn();
vi.mock("./run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

// Mock logger
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { enqueueExtraction } from "./queue";

const baseParams = {
  invoiceId: "inv-1",
  orgId: "org-1",
  userId: "user-1",
  filePath: "org-1/inv-1/file.pdf",
  fileType: "application/pdf",
};

describe("enqueueExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runExtraction with the provided params", async () => {
    mockRunExtraction.mockResolvedValue({ data: {}, durationMs: 100 });

    await enqueueExtraction(baseParams);

    expect(mockRunExtraction).toHaveBeenCalledWith(baseParams);
  });

  it("limits concurrency to 5 concurrent extractions", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockRunExtraction.mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 50));
      concurrentCount--;
      return { data: {}, durationMs: 50 };
    });

    // Launch 10 extractions
    const promises = Array.from({ length: 10 }, (_, i) =>
      enqueueExtraction({ ...baseParams, invoiceId: `inv-${i}` })
    );

    await Promise.all(promises);

    expect(maxConcurrent).toBeLessThanOrEqual(5);
    expect(mockRunExtraction).toHaveBeenCalledTimes(10);
  });

  it("propagates errors from runExtraction", async () => {
    mockRunExtraction.mockRejectedValue(new Error("Extraction failed"));

    await expect(enqueueExtraction(baseParams)).rejects.toThrow("Extraction failed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/extraction/queue.test.ts`
Expected: FAIL — module `./queue` not found

- [ ] **Step 3: Implement the extraction queue**

Create `lib/extraction/queue.ts`:

```typescript
import pLimit from "p-limit";
import { runExtraction } from "./run";
import { logger } from "@/lib/utils/logger";

const extractionLimit = pLimit(5);

interface EnqueueParams {
  invoiceId: string;
  orgId: string;
  userId: string;
  filePath: string;
  fileType: string;
}

export function enqueueExtraction(params: EnqueueParams): Promise<unknown> {
  logger.info("extraction_enqueued", {
    action: "enqueue_extraction",
    invoiceId: params.invoiceId,
    orgId: params.orgId,
    pendingCount: extractionLimit.pendingCount,
    activeCount: extractionLimit.activeCount,
  });

  return extractionLimit(() => runExtraction(params));
}
```

- [ ] **Step 4: Install p-limit**

Run: `npm install p-limit`

Note: p-limit v6+ is ESM-only. If the project uses CommonJS, install v5: `npm install p-limit@5`. Check `package.json` for `"type": "module"` to decide. Next.js 14 with App Router supports ESM imports in server code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/queue.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/queue.ts lib/extraction/queue.test.ts package.json package-lock.json
git commit -m "feat: add extraction concurrency queue with p-limit(5) (DOC-68)"
```

---

## Task 4: Add Double-Extraction Guard to `runExtraction`

**Files:**
- Modify: `lib/extraction/run.ts:10-18`
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Add test for double-extraction guard**

Add to `lib/extraction/run.test.ts` a new test case:

```typescript
it("skips extraction if invoice is already extracting", async () => {
  // Mock admin client to return invoice with status 'extracting'
  // The guard should check the current status before proceeding
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { status: "extracting" },
              error: null,
            }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }
    // ... other tables
  });

  const result = await runExtraction(baseParams);
  // Should return early without calling the provider
  expect(mockProvider.extractInvoiceData).not.toHaveBeenCalled();
});
```

The exact mock setup depends on how `run.test.ts` is structured — adapt the mocks to match the existing test patterns.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/extraction/run.test.ts -- -t "skips extraction if invoice is already extracting"`
Expected: FAIL

- [ ] **Step 3: Add double-extraction guard at the top of `runExtraction`**

At the beginning of the `try` block in `runExtraction()`, before the signed URL generation (line ~21), add:

```typescript
// Double-extraction guard: skip if already extracting (prevents race conditions)
const { data: currentInvoice } = await admin
  .from("invoices")
  .select("status")
  .eq("id", invoiceId)
  .single();

if (currentInvoice?.status === "extracting") {
  logger.warn("extraction_already_in_progress", {
    action: "run_extraction",
    invoiceId,
    orgId,
    status: "skipped",
  });
  return {
    data: { vendorName: null, lineItems: [], confidenceScore: null },
    rawResponse: null,
    modelVersion: "skipped",
    durationMs: 0,
  } as unknown as ExtractionResult;
}

// Set status to extracting
await admin
  .from("invoices")
  .update({ status: "extracting", error_message: null })
  .eq("id", invoiceId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/extraction/run.test.ts`
Expected: All tests PASS (including existing tests)

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat: add double-extraction guard to runExtraction (DOC-68)"
```

---

## Task 5: Modify Upload Route — Async + batch_id + Orphan Cleanup

**Files:**
- Modify: `app/api/invoices/upload/route.ts`
- Modify: `app/api/invoices/upload/route.test.ts`

- [ ] **Step 1: Write new tests for the upload route changes**

Add these tests to `app/api/invoices/upload/route.test.ts`:

```typescript
it("inserts invoice with status 'uploaded' (not 'uploading')", async () => {
  // Setup: auth + org + storage success
  // Verify: the insert call uses status: 'uploaded'
  // Verify: no status update to 'extracting' from upload route (extraction handles that)
});

it("accepts optional batch_id in form data", async () => {
  // Setup: include batch_id in FormData
  // Verify: insert call includes batch_id
});

it("rejects invalid batch_id format", async () => {
  // Setup: include batch_id = "not-a-uuid" in FormData
  // Verify: returns 400 VALIDATION_ERROR
});

it("rejects batch_id when >25 invoices already exist with that batch_id", async () => {
  // Setup: mock count query to return 25
  // Verify: returns 400 with "Batch limit reached"
});

it("calls enqueueExtraction instead of runExtraction directly", async () => {
  // Verify: enqueueExtraction is called, not runExtraction
});

it("cleans up orphaned storage file when DB insert fails", async () => {
  // Setup: storage upload succeeds, DB insert fails
  // Verify: storage.from('invoices').remove([storagePath]) is called
});
```

- [ ] **Step 2: Run new tests to verify they fail**

Run: `npx vitest run app/api/invoices/upload/route.test.ts`
Expected: New tests FAIL

- [ ] **Step 3: Modify the upload route**

Key changes to `app/api/invoices/upload/route.ts`:

1. Import `enqueueExtraction` from `@/lib/extraction/queue` instead of `runExtraction` from `@/lib/extraction/run`
2. Parse optional `batch_id` from FormData
3. Validate `batch_id` is a UUID if provided (regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
4. If `batch_id` provided, count existing invoices with that `batch_id`. If ≥25, return 400.
5. Insert with `status: "uploaded"` and include `batch_id` if provided
6. Remove step 7 (update status to extracting) — extraction handles this now
7. Replace `waitUntil(runExtraction(...))` with `waitUntil(enqueueExtraction(...))`
8. Add orphan cleanup: wrap DB insert in try/catch, if insert fails after storage upload, call `admin.storage.from("invoices").remove([storagePath])`

```typescript
// Parse batch_id from form data
const batchId = formData.get("batch_id") as string | null;
if (batchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
  return validationError("Invalid batch_id format.");
}

// Server-side batch size enforcement
if (batchId) {
  const { count, error: countError } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  if (!countError && (count ?? 0) >= 25) {
    return validationError("Batch limit reached (25 files maximum).");
  }
}
```

For the insert, change status to `"uploaded"` and add batch_id:

```typescript
const { error: insertError } = await admin
  .from("invoices")
  .insert({
    id: invoiceId,
    org_id: orgId,
    status: "uploaded",
    file_path: storagePath,
    file_name: fileName,
    file_type: fileType,
    file_size_bytes: fileSize,
    ...(batchId && { batch_id: batchId }),
  })
  .select("id")
  .single();

if (insertError) {
  // Cleanup orphaned storage file
  await admin.storage.from("invoices").remove([storagePath]);
  logger.error("invoice_upload_db_insert_failed", { ... });
  return internalError("Upload failed. Please try again.");
}
```

Remove the separate "update status to extracting" step (step 7 in current code). Replace the `waitUntil` call:

```typescript
waitUntil(
  enqueueExtraction({
    invoiceId,
    orgId: orgId!,
    userId: userId!,
    filePath: storagePath,
    fileType,
  }).catch(() => {
    logger.warn("invoice_upload_extraction_failed", { ... });
  })
);
```

- [ ] **Step 4: Update test mocks**

Update the mock for `@/lib/extraction/run` → `@/lib/extraction/queue`:

```typescript
const mockEnqueueExtraction = vi.fn();
vi.mock("@/lib/extraction/queue", () => ({
  enqueueExtraction: (...args: unknown[]) => mockEnqueueExtraction(...args),
}));
```

Update the success test to check for `enqueueExtraction` instead of `runExtraction`.

Add mock for admin storage `remove` method for orphan cleanup test.

Add mock for admin `select` with `count` for batch size enforcement test.

- [ ] **Step 5: Run all upload tests**

Run: `npx vitest run app/api/invoices/upload/route.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/invoices/upload/route.ts app/api/invoices/upload/route.test.ts
git commit -m "feat: async upload with batch_id support and orphan cleanup (DOC-68)"
```

---

## Task 6: Extend `useInvoiceStatus` for Multi-Invoice Subscriptions

**Files:**
- Create: `lib/hooks/useInvoiceStatuses.ts`
- Create: `lib/hooks/useInvoiceStatuses.test.ts`

The existing `useInvoiceStatus` hook stays unchanged for single-invoice use. A new `useInvoiceStatuses` hook handles multi-invoice Realtime subscriptions.

- [ ] **Step 1: Create the multi-invoice hook**

Create `lib/hooks/useInvoiceStatuses.ts`:

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface InvoiceStatusEntry {
  status: InvoiceStatus;
  errorMessage: string | null;
}

interface UseInvoiceStatusesReturn {
  statuses: Record<string, InvoiceStatusEntry>;
  isConnected: boolean;
}

const TERMINAL_STATUSES: InvoiceStatus[] = ["pending_review", "approved", "synced", "error"];

export function useInvoiceStatuses(
  invoiceIds: string[]
): UseInvoiceStatusesReturn {
  const [statuses, setStatuses] = useState<Record<string, InvoiceStatusEntry>>({});
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const idsKey = invoiceIds.sort().join(",");

  const resetState = useCallback(() => {
    setStatuses({});
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (invoiceIds.length === 0) {
      resetState();
      return;
    }

    const supabase = createClient();
    const isMounted = { current: true };
    const hasReceivedRealtimeUpdate = { current: new Set<string>() };

    // Fetch current statuses for all invoice IDs
    supabase
      .from("invoices")
      .select("id, status, error_message")
      .in("id", invoiceIds)
      .then(({ data, error }) => {
        if (!isMounted.current || error || !data) return;
        setStatuses((prev) => {
          const next = { ...prev };
          for (const row of data) {
            // Skip if realtime already delivered a fresher update
            if (hasReceivedRealtimeUpdate.current.has(row.id)) continue;
            next[row.id] = {
              status: row.status as InvoiceStatus,
              errorMessage: row.error_message ?? null,
            };
          }
          return next;
        });
      });

    // Subscribe to realtime changes for all invoice IDs
    // Supabase Realtime filter supports `in` operator for multiple values
    const channel = supabase
      .channel(`invoice-statuses-${idsKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
        },
        (payload) => {
          if (!isMounted.current) return;
          const newRecord = payload.new as {
            id: string;
            status: InvoiceStatus;
            error_message: string | null;
          };
          // Only track invoices we care about
          if (!invoiceIds.includes(newRecord.id)) return;
          hasReceivedRealtimeUpdate.current.add(newRecord.id);
          setStatuses((prev) => ({
            ...prev,
            [newRecord.id]: {
              status: newRecord.status,
              errorMessage: newRecord.error_message ?? null,
            },
          }));
        }
      )
      .subscribe((subscriptionStatus) => {
        if (!isMounted.current) return;
        setIsConnected(subscriptionStatus === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      isMounted.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [idsKey, invoiceIds.length, resetState]);

  return { statuses, isConnected };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/useInvoiceStatuses.ts
git commit -m "feat: add useInvoiceStatuses hook for multi-invoice Realtime (DOC-68)"
```

---

## Task 7: Verify Retry Route Still Works

**Files:**
- Read: `app/api/invoices/[id]/retry/route.ts`

- [ ] **Step 1: Verify retry route calls `runExtraction` directly (not via queue)**

The retry route at `app/api/invoices/[id]/retry/route.ts` calls `runExtraction()` directly — this is intentional per the spec. User-initiated retries get immediate processing, bypassing the concurrency queue.

Read the file and confirm it imports from `@/lib/extraction/run`, not `@/lib/extraction/queue`. No changes needed.

- [ ] **Step 2: Run existing retry tests if they exist**

Run: `npx vitest run app/api/invoices/\\[id\\]/retry/`
Expected: All tests PASS (if tests exist)

- [ ] **Step 3: Verify `runExtraction` now sets status to `extracting` internally**

Since we moved status-setting into `runExtraction` (Task 4), the retry route's manual status update to `extracting` (line 83-87) is now redundant but harmless — `runExtraction` will check status and set it. The retry route pre-sets it which is fine since the double-extraction guard checks for `extracting` status.

No changes needed to the retry route.

---

## Task 8: Full Integration Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No warnings, no errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Update CLAUDE.md decisions log**

Add to the Decisions Log table:

```
| 2026-03-19 | Extraction uses p-limit(5) concurrency control via waitUntil, Supabase Realtime for status updates (not polling) | 25 files × 4s = 100s synchronous is too slow. p-limit caps concurrent Claude calls. Realtime already in place. | DOC-68 |
```

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: add async extraction decision to CLAUDE.md (DOC-68)"
```

---

## Structured Logging Requirements

All new log entries must follow the existing `logger` pattern:

- Queue entry: `{ action: "enqueue_extraction", invoiceId, orgId, pendingCount, activeCount }`
- Double-extraction skip: `{ action: "run_extraction", invoiceId, orgId, status: "skipped" }`
- Batch size rejection: `{ action: "upload", invoiceId, orgId, batchId, batchSize, status: "rejected" }`
- Orphan cleanup: `{ action: "upload_orphan_cleanup", invoiceId, orgId, storagePath }`
