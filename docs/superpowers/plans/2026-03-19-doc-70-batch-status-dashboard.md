# DOC-70: Batch Status Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch-aware grouping to the invoice list (accordion with status pills, Review Next, Retry All Failed) and batch navigation to the review page (Previous/Next, "Invoice N of M").

**Architecture:** Client-side grouping of flat invoice list by `batch_id`. Server changes are minimal — add `batch_id` to select queries and support `batch_id` filter param. New components: `BatchHeader` (accordion header with status pills and actions) and `BatchNavigation` (review page nav bar). Realtime status updates via existing `useInvoiceStatuses` hook.

**Tech Stack:** Next.js 14, Supabase (Postgres + Realtime), Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-doc-70-batch-status-dashboard-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/invoices/types.ts` | Add `batch_id` to `InvoiceListItem` and `InvoiceListParams` |
| `lib/invoices/queries.ts` | Add `batch_id` to select, support `batch_id` filter, add `fetchBatchManifest()` |
| `lib/invoices/batch-utils.ts` | **New.** Pure functions: `groupInvoicesByBatch()`, `getBatchStatusSummary()`, `getNextReviewableInvoice()` |
| `lib/invoices/batch-utils.test.ts` | **New.** Tests for all batch utility functions |
| `components/invoices/BatchHeader.tsx` | **New.** Accordion header row with status pills, Review Next, Retry All Failed |
| `components/invoices/BatchNavigation.tsx` | **New.** Review page navigation bar (Back to batch, N of M, Previous/Next) |
| `components/invoices/InvoiceList.tsx` | Integrate batch grouping, accordion expand/collapse, Realtime overlay, toast display |
| `components/invoices/ReviewLayout.tsx` | Thread `batchId` and `batchManifest` through to ExtractionForm |
| `components/invoices/ExtractionForm.tsx` | Add redirect-after-last-review logic in handleStatusChange |
| `app/(dashboard)/invoices/page.tsx` | Parse `batch_id` and `toast` from searchParams, pass to query and component |
| `app/api/invoices/route.ts` | Parse `batch_id` and `output_type` params, pass to query |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Fetch `batch_id` + batch manifest, pass to `BatchNavigation` and `ReviewLayout` |

---

## Task 1: Data Layer — Types and Query Changes

**Files:**
- Modify: `lib/invoices/types.ts:3-32`
- Modify: `lib/invoices/queries.ts:150-271`
- Test: `lib/invoices/queries.test.ts` (new)

- [ ] **Step 1: Add `batch_id` to `InvoiceListItem` type**

In `lib/invoices/types.ts`, add `batch_id` field to the `InvoiceListItem` interface:

```typescript
export interface InvoiceListItem {
  id: string;
  file_name: string;
  status: InvoiceStatus;
  uploaded_at: string;
  output_type: OutputType | null;
  batch_id: string | null;  // <-- add this
  extracted_data: {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
  } | null;
}
```

- [ ] **Step 2: Add `batch_id` to `InvoiceListParams`**

In `lib/invoices/types.ts`, add `batch_id` to the params interface:

```typescript
export interface InvoiceListParams {
  status?: string;
  sort?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
  output_type?: string;
  batch_id?: string;  // <-- add this
}
```

Also add to the `ValidatedParams` interface in `queries.ts`:

```typescript
interface ValidatedParams {
  status: string;
  sort: string;
  direction: string;
  cursor?: string;
  limit: number;
  output_type: string;
  batch_id?: string;  // <-- add this
}
```

- [ ] **Step 3: Add `batch_id` to `fetchInvoiceList` select and filter**

In `lib/invoices/queries.ts`, update the `fetchInvoiceList` function:

1. Add `batch_id` to the select string (after `output_type,`):
```sql
batch_id,
```

2. After the output_type filter block (~line 188), add batch_id filter:
```typescript
// Batch filter — when filtering by batch, skip pagination (max 25 invoices per batch)
if (params.batch_id) {
  query = query.eq("batch_id", params.batch_id);
}
```

3. In the `invoices` mapping (~line 248), add batch_id:
```typescript
batch_id: (row.batch_id as string) ?? null,
```

4. When `batch_id` is present, skip the `limit + 1` logic — return all results. Wrap the limit line:
```typescript
if (!params.batch_id) {
  query = query.limit(limit + 1);
}
```

And adjust the hasNextPage logic:
```typescript
const hasNextPage = !params.batch_id && data.length > limit;
```

- [ ] **Step 4: Pass `batch_id` through `validateListParams`**

In `validateListParams`, add batch_id passthrough (with UUID format validation):

```typescript
// Validate batch_id (must be UUID format if present)
const batch_id = params.batch_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.batch_id)
  ? params.batch_id
  : undefined;

return {
  status,
  sort,
  direction,
  cursor: params.cursor,
  limit,
  output_type,
  batch_id,
};
```

- [ ] **Step 5: Add `fetchBatchManifest` query**

Add at the end of `lib/invoices/queries.ts`:

```typescript
export interface BatchManifestItem {
  id: string;
  status: InvoiceStatus;
  uploaded_at: string;
}

export async function fetchBatchManifest(
  supabase: SupabaseClient,
  batchId: string
): Promise<BatchManifestItem[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, status, uploaded_at")
    .eq("batch_id", batchId)
    .order("uploaded_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    status: row.status as InvoiceStatus,
    uploaded_at: row.uploaded_at as string,
  }));
}
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS with no type errors

- [ ] **Step 7: Commit**

```bash
git add lib/invoices/types.ts lib/invoices/queries.ts
git commit -m "feat(DOC-70): add batch_id to invoice list types and queries"
```

---

## Task 2: Batch Utility Functions (Pure Logic)

**Files:**
- Create: `lib/invoices/batch-utils.ts`
- Create: `lib/invoices/batch-utils.test.ts`

- [ ] **Step 1: Write failing tests for `groupInvoicesByBatch`**

Create `lib/invoices/batch-utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  groupInvoicesByBatch,
  getBatchStatusSummary,
  getNextReviewableInvoice,
  type BatchGroup,
} from "./batch-utils";
import type { InvoiceListItem } from "./types";

function makeInvoice(overrides: Partial<InvoiceListItem> & { id: string }): InvoiceListItem {
  return {
    file_name: "test.pdf",
    status: "pending_review",
    uploaded_at: "2026-03-18T10:00:00Z",
    output_type: null,
    batch_id: null,
    extracted_data: null,
    ...overrides,
  };
}

describe("groupInvoicesByBatch", () => {
  it("groups invoices with matching batch_id", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:01:00Z" }),
      makeInvoice({ id: "3", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result).toHaveLength(2); // 1 batch group + 1 individual
    const batchGroup = result.find((g) => g.type === "batch");
    expect(batchGroup?.invoices).toHaveLength(2);
  });

  it("treats single-invoice batches as individual rows", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: "batch-a" }),
      makeInvoice({ id: "2", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result.every((g) => g.type === "individual")).toBe(true);
  });

  it("returns individual rows for null batch_id invoices", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: null }),
      makeInvoice({ id: "2", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result).toHaveLength(2);
    expect(result.every((g) => g.type === "individual")).toBe(true);
  });

  it("sorts groups by earliest uploaded_at descending (most recent first)", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: null, uploaded_at: "2026-03-18T12:00:00Z" }),
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
      makeInvoice({ id: "3", batch_id: "batch-a", uploaded_at: "2026-03-18T10:01:00Z" }),
    ];
    const result = groupInvoicesByBatch(invoices);
    // Individual at 12:00 is more recent, so comes first in desc order
    expect(result[0].type).toBe("individual");
    expect(result[1].type).toBe("batch");
  });

  it("sorts invoices within a batch by uploaded_at ascending", () => {
    const invoices = [
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:05:00Z" }),
      makeInvoice({ id: "1", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
    ];
    const result = groupInvoicesByBatch(invoices);
    const batch = result[0];
    expect(batch.invoices[0].id).toBe("1");
    expect(batch.invoices[1].id).toBe("2");
  });
});

describe("getBatchStatusSummary", () => {
  it("counts statuses correctly including uploading and approved", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "extracting" }),
      makeInvoice({ id: "2", status: "uploaded" }),
      makeInvoice({ id: "3", status: "uploading" }),
      makeInvoice({ id: "4", status: "pending_review" }),
      makeInvoice({ id: "5", status: "error" }),
      makeInvoice({ id: "6", status: "synced" }),
      makeInvoice({ id: "7", status: "approved" }),
    ];
    const summary = getBatchStatusSummary(invoices);
    expect(summary.processing).toBe(3); // extracting + uploaded + uploading
    expect(summary.readyForReview).toBe(1);
    expect(summary.synced).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.approved).toBe(1);
  });

  it("returns all zeros for empty array", () => {
    const summary = getBatchStatusSummary([]);
    expect(summary.processing).toBe(0);
    expect(summary.readyForReview).toBe(0);
  });
});

describe("getNextReviewableInvoice", () => {
  it("returns first pending_review invoice", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "synced" }),
      makeInvoice({ id: "2", status: "pending_review" }),
      makeInvoice({ id: "3", status: "pending_review" }),
    ];
    expect(getNextReviewableInvoice(invoices)).toBe("2");
  });

  it("returns null when no reviewable invoices", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "synced" }),
      makeInvoice({ id: "2", status: "approved" }),
    ];
    expect(getNextReviewableInvoice(invoices)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(getNextReviewableInvoice([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/invoices/batch-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement batch utility functions**

Create `lib/invoices/batch-utils.ts`:

```typescript
import type { InvoiceListItem } from "./types";
import type { InvoiceStatus } from "@/lib/types/invoice";

export interface BatchGroup {
  type: "batch";
  batchId: string;
  invoices: InvoiceListItem[];
  earliestUploadedAt: string;
}

export interface IndividualRow {
  type: "individual";
  invoices: [InvoiceListItem]; // always exactly one
  batchId: null;
  earliestUploadedAt: string;
}

export type InvoiceRow = BatchGroup | IndividualRow;

export interface BatchStatusSummary {
  processing: number;   // uploaded + extracting
  readyForReview: number; // pending_review
  approved: number;
  synced: number;
  failed: number;       // error
}

/**
 * Groups a flat invoice list into batch groups and individual rows.
 * Single-invoice batches are treated as individual rows.
 * Groups are sorted by earliest uploaded_at.
 */
export function groupInvoicesByBatch(invoices: InvoiceListItem[]): InvoiceRow[] {
  const batchMap = new Map<string, InvoiceListItem[]>();
  const individuals: InvoiceListItem[] = [];

  for (const invoice of invoices) {
    if (invoice.batch_id) {
      const existing = batchMap.get(invoice.batch_id) ?? [];
      existing.push(invoice);
      batchMap.set(invoice.batch_id, existing);
    } else {
      individuals.push(invoice);
    }
  }

  const rows: InvoiceRow[] = [];

  for (const [batchId, batchInvoices] of batchMap) {
    // Single-invoice batch → treat as individual
    if (batchInvoices.length === 1) {
      individuals.push(batchInvoices[0]);
      continue;
    }

    // Sort within batch by uploaded_at ascending
    batchInvoices.sort(
      (a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    );

    rows.push({
      type: "batch",
      batchId,
      invoices: batchInvoices,
      earliestUploadedAt: batchInvoices[0].uploaded_at,
    });
  }

  // Add individual rows
  for (const invoice of individuals) {
    rows.push({
      type: "individual",
      batchId: null,
      invoices: [invoice],
      earliestUploadedAt: invoice.uploaded_at,
    });
  }

  // Sort all rows by earliest uploaded_at (descending to match default list order)
  rows.sort(
    (a, b) =>
      new Date(b.earliestUploadedAt).getTime() - new Date(a.earliestUploadedAt).getTime()
  );

  return rows;
}

/**
 * Summarizes statuses for a set of invoices (typically one batch).
 * Combines uploaded + extracting into "processing".
 */
export function getBatchStatusSummary(invoices: InvoiceListItem[]): BatchStatusSummary {
  const summary: BatchStatusSummary = {
    processing: 0,
    readyForReview: 0,
    approved: 0,
    synced: 0,
    failed: 0,
  };

  for (const invoice of invoices) {
    switch (invoice.status) {
      case "uploading":
      case "uploaded":
      case "extracting":
        summary.processing++;
        break;
      case "pending_review":
        summary.readyForReview++;
        break;
      case "approved":
        summary.approved++;
        break;
      case "synced":
        summary.synced++;
        break;
      case "error":
        summary.failed++;
        break;
    }
  }

  return summary;
}

const REVIEWABLE_STATUSES: InvoiceStatus[] = ["pending_review"];

/**
 * Returns the ID of the first pending_review invoice in the list.
 * Assumes invoices are already sorted by uploaded_at ascending.
 */
export function getNextReviewableInvoice(invoices: InvoiceListItem[]): string | null {
  const next = invoices.find((inv) => REVIEWABLE_STATUSES.includes(inv.status));
  return next?.id ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/invoices/batch-utils.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add lib/invoices/batch-utils.ts lib/invoices/batch-utils.test.ts
git commit -m "feat(DOC-70): add batch grouping utility functions with tests"
```

---

## Task 3: BatchHeader Component

**Files:**
- Create: `components/invoices/BatchHeader.tsx`

- [ ] **Step 1: Create BatchHeader component**

Create `components/invoices/BatchHeader.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceListItem } from "@/lib/invoices/types";
import {
  getBatchStatusSummary,
  getNextReviewableInvoice,
} from "@/lib/invoices/batch-utils";
import { formatRelativeTime } from "@/lib/utils/date";

interface BatchHeaderProps {
  batchId: string;
  invoices: InvoiceListItem[];
  totalCount?: number; // total invoices in batch (for partial page display)
  isExpanded: boolean;
  onToggle: () => void;
}

export default function BatchHeader({
  batchId,
  invoices,
  totalCount,
  isExpanded,
  onToggle,
}: BatchHeaderProps) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);

  const summary = getBatchStatusSummary(invoices);
  const nextReviewableId = getNextReviewableInvoice(invoices);
  const count = totalCount ?? invoices.length;
  const earliestUpload = invoices[0]?.uploaded_at;

  const allReviewed =
    summary.processing === 0 &&
    summary.readyForReview === 0 &&
    summary.failed === 0;
  const waitingForExtraction =
    summary.processing > 0 && summary.readyForReview === 0;

  async function handleRetryAllFailed() {
    setIsRetrying(true);
    const failedInvoices = invoices.filter((inv) => inv.status === "error");
    let retried = 0;
    let failedToRetry = 0;

    for (const invoice of failedInvoices) {
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/retry`, {
          method: "POST",
        });
        if (res.ok) {
          retried++;
        } else {
          failedToRetry++;
        }
      } catch {
        failedToRetry++;
      }
    }

    setIsRetrying(false);

    // Toast feedback via temporary state
    if (failedToRetry > 0) {
      setRetryResult(`Retried ${retried} invoices. ${failedToRetry} could not be retried.`);
      setTimeout(() => setRetryResult(null), 5000);
    }
  }

  return (
    <div>
    {retryResult && (
      <div className="px-3 py-2 text-xs font-medium text-[#92400E] bg-[#FEF3C7] rounded-md mb-2">
        {retryResult}
      </div>
    )}
    <div
      className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-3 py-3 bg-[#F8FAFC] rounded-lg cursor-pointer hover:bg-[#F1F5F9] transition-colors"
      onClick={onToggle}
      role="button"
      aria-expanded={isExpanded}
    >
      {/* Chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className={`h-4 w-4 text-muted transition-transform duration-200 ${
          isExpanded ? "rotate-90" : ""
        }`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>

      {/* Batch label */}
      <span className="text-sm text-text font-medium">
        Batch uploaded {earliestUpload ? formatRelativeTime(earliestUpload) : "—"} — {count} invoice{count !== 1 ? "s" : ""}
        {totalCount && totalCount > invoices.length && (
          <span className="text-muted font-normal ml-1">
            (showing {invoices.length} of {totalCount} —{" "}
            <span
              className="text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/invoices?batch_id=${batchId}`);
              }}
            >
              View all
            </span>
            )
          </span>
        )}
      </span>

      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2 md:ml-auto mr-3">
        {summary.processing > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1E40AF] bg-[#DBEAFE] rounded-full px-2 py-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#1E40AF] animate-pulse" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#1E40AF]" />
            </span>
            {summary.processing} processing
          </span>
        )}
        {summary.readyForReview > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#92400E] bg-[#FEF3C7] rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#92400E]" />
            {summary.readyForReview} ready
          </span>
        )}
        {summary.approved > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] bg-[#DBEAFE] rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1D4ED8]" />
            {summary.approved} approved
          </span>
        )}
        {summary.synced > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#065F46] bg-[#D1FAE5] rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#065F46]" />
            {summary.synced} synced
          </span>
        )}
        {summary.failed > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#991B1B] bg-[#FEE2E2] rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#991B1B]" />
            {summary.failed} failed
          </span>
        )}
      </div>

      {/* Action buttons — stop propagation so clicks don't toggle the accordion */}
      <div className="flex w-full md:w-auto items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {summary.failed > 0 && (
          <button
            onClick={handleRetryAllFailed}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#FCA5A5] text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRetrying ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Retrying…
              </>
            ) : (
              `Retry ${summary.failed} Failed`
            )}
          </button>
        )}
        {nextReviewableId ? (
          <button
            onClick={() => router.push(`/invoices/${nextReviewableId}/review`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Review Next
          </button>
        ) : (
          <button
            disabled
            title={allReviewed ? "All reviewed" : waitingForExtraction ? "Waiting for extraction" : ""}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white opacity-50 cursor-not-allowed"
          >
            Review Next
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/BatchHeader.tsx
git commit -m "feat(DOC-70): add BatchHeader component with status pills and actions"
```

---

## Task 4: BatchNavigation Component

**Files:**
- Create: `components/invoices/BatchNavigation.tsx`

- [ ] **Step 1: Create BatchNavigation component**

Create `components/invoices/BatchNavigation.tsx`:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { BatchManifestItem } from "@/lib/invoices/queries";

interface BatchNavigationProps {
  currentInvoiceId: string;
  batchId: string;
  initialManifest: BatchManifestItem[];
}

const NAVIGABLE_STATUSES: InvoiceStatus[] = [
  "pending_review",
  "uploaded",
  "extracting",
  "error",
];

export default function BatchNavigation({
  currentInvoiceId,
  batchId,
  initialManifest,
}: BatchNavigationProps) {
  const router = useRouter();
  const [manifest, setManifest] = useState(initialManifest);

  // Subscribe to batch status changes and refresh manifest
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`batch-nav-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
        },
        (payload) => {
          const updated = payload.new as { id: string; status: InvoiceStatus };
          // Use functional update to avoid stale closure over manifest
          setManifest((prev) => {
            if (!prev.some((m) => m.id === updated.id)) return prev;
            return prev.map((item) =>
              item.id === updated.id
                ? { ...item, status: updated.status }
                : item
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-subscribe if batchId changes (shouldn't in practice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const currentIndex = manifest.findIndex((m) => m.id === currentInvoiceId);
  const total = manifest.length;
  const position = currentIndex + 1; // 1-indexed for display

  // Previous: prior invoice regardless of status
  const prevInvoice = currentIndex > 0 ? manifest[currentIndex - 1] : null;

  // Next: find next navigable invoice (pending_review, uploaded, or extracting), skip approved/synced
  const nextInvoice = useMemo(() => {
    for (let i = currentIndex + 1; i < manifest.length; i++) {
      if (NAVIGABLE_STATUSES.includes(manifest[i].status)) {
        return manifest[i];
      }
    }
    return null;
  }, [manifest, currentIndex]);

  return (
    <div className="flex items-center justify-between bg-surface border-b border-border px-4 py-2.5">
      {/* Left: Back to batch */}
      <button
        onClick={() => router.push(`/invoices?batch_id=${batchId}`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to batch
      </button>

      {/* Center: Position counter */}
      <span className="text-sm font-medium text-text">
        Invoice {position} of {total}
      </span>

      {/* Right: Previous / Next */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => prevInvoice && router.push(`/invoices/${prevInvoice.id}/review`)}
          disabled={!prevInvoice}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-text border border-border hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous invoice"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Previous
        </button>
        <button
          onClick={() => nextInvoice && router.push(`/invoices/${nextInvoice.id}/review`)}
          disabled={!nextInvoice}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-text border border-border hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next invoice"
        >
          Next
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/BatchNavigation.tsx
git commit -m "feat(DOC-70): add BatchNavigation component for review page"
```

---

## Task 5: Integrate Batch Grouping into InvoiceList

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`
- Modify: `app/(dashboard)/invoices/page.tsx:8-17` (add `batch_id` prop)

- [ ] **Step 1: Add `batchId` prop to InvoiceList**

In `components/invoices/InvoiceList.tsx`, update the `InvoiceListProps` interface:

```typescript
interface InvoiceListProps {
  invoices: InvoiceListItem[];
  counts: InvoiceListCounts;
  nextCursor: string | null;
  currentStatus: string;
  currentSort: string;
  currentDirection: string;
  hasCursor: boolean;
  currentOutputType: string;
  currentBatchId?: string;  // <-- add this
}
```

And destructure it in the component function signature.

**Note on page boundary `totalCount`:** In the current implementation, we don't have a mechanism to know the total batch size when a batch is split across pages. The `BatchHeader` component accepts `totalCount` as an optional prop. For MVP, when a batch is split across pages, `totalCount` is not provided — the header just shows the count of invoices on the current page. The "View all" link (navigating to `?batch_id=X`) remains the way to see the full batch. If this becomes confusing at scale, a lightweight aggregate query can be added later.

- [ ] **Step 2: Add batch grouping and Realtime state management**

At the top of the `InvoiceList` component function, add:

```typescript
import { useState, useEffect, useMemo } from "react";
import { groupInvoicesByBatch, type InvoiceRow } from "@/lib/invoices/batch-utils";
import { useInvoiceStatuses } from "@/lib/hooks/useInvoiceStatuses";
import BatchHeader from "./BatchHeader";

// Inside component function:

// Local state overlays Realtime updates onto server-rendered data
const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

// Merge server data with Realtime overrides
const mergedInvoices = useMemo(() =>
  invoices.map((inv) => ({
    ...inv,
    status: (statusOverrides[inv.id] as InvoiceListItem["status"]) ?? inv.status,
  })),
  [invoices, statusOverrides]
);

// Group into batch rows
const rows = useMemo(() => groupInvoicesByBatch(mergedInvoices), [mergedInvoices]);

// Collect IDs needing Realtime subscription (uploaded/extracting)
const realtimeIds = useMemo(() =>
  invoices
    .filter((inv) => ["uploaded", "extracting"].includes(
      (statusOverrides[inv.id] as string) ?? inv.status
    ))
    .map((inv) => inv.id),
  [invoices, statusOverrides]
);

const { statuses: realtimeStatuses } = useInvoiceStatuses(realtimeIds);

// Merge Realtime status updates into overrides
useEffect(() => {
  const newOverrides: Record<string, string> = {};
  for (const [id, entry] of Object.entries(realtimeStatuses)) {
    newOverrides[id] = entry.status;
  }
  if (Object.keys(newOverrides).length > 0) {
    setStatusOverrides((prev) => ({ ...prev, ...newOverrides }));
  }
}, [realtimeStatuses]);

// Accordion expand/collapse state
const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => {
  // Auto-expand if filtering by batch_id
  if (currentBatchId) return new Set([currentBatchId]);
  return new Set();
});

function toggleBatch(batchId: string) {
  setExpandedBatches((prev) => {
    const next = new Set(prev);
    if (next.has(batchId)) {
      next.delete(batchId);
    } else {
      next.add(batchId);
    }
    return next;
  });
}
```

- [ ] **Step 3: Replace the invoice rendering with row-based rendering**

Replace the `invoices.map(...)` in both the desktop table `<tbody>` and mobile cards section. Wrap each in a function that iterates over `rows` instead of `invoices`.

For the desktop table body:

```tsx
<tbody>
  {rows.map((row) => {
    if (row.type === "batch") {
      const isExpanded = expandedBatches.has(row.batchId);
      return (
        <tr key={`batch-${row.batchId}`}>
          <td colSpan={7} className="p-0">
            <BatchHeader
              batchId={row.batchId}
              invoices={row.invoices}
              isExpanded={isExpanded}
              onToggle={() => toggleBatch(row.batchId)}
            />
            {isExpanded && (
              <div className="border-l-2 border-blue-200 ml-3">
                <table className="w-full">
                  <tbody>
                    {row.invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group cursor-pointer" onClick={() => router.push(`/invoices/${invoice.id}/review`)}>
                        {/* Same cells as existing individual row rendering */}
                        <td className="py-3.5 px-3 text-[14px] text-text truncate max-w-[200px]">{invoice.file_name}</td>
                        <td className="py-3.5 px-3 text-[14px] font-medium text-text">
                          {invoice.extracted_data?.vendor_name ?? <span className="text-muted">Pending</span>}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[13px] text-[#475569]">
                          {invoice.extracted_data?.invoice_number ?? "—"}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[13px] text-[#475569]">
                          {formatDate(invoice.extracted_data?.invoice_date ?? null)}
                        </td>
                        <td className="py-3.5 px-3 text-[14px] text-right font-mono">
                          {invoice.extracted_data?.total_amount != null
                            ? formatCurrency(invoice.extracted_data.total_amount, null)
                            : "—"}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="inline-flex items-center gap-2">
                            <InvoiceStatusBadge status={invoice.status} />
                            {invoice.status === "synced" && invoice.output_type && (
                              <span className="text-xs text-muted">
                                {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-[14px] text-muted">
                          {formatRelativeTime(invoice.uploaded_at)}
                        </td>
                      </tr>
                    ))}
                    {/* Batch empty states */}
                    {row.invoices.every((inv) => inv.status === "error") && (
                      <tr><td colSpan={7} className="px-4 py-3 text-sm text-[#991B1B]">All extractions failed. Check file quality and retry.</td></tr>
                    )}
                    {row.invoices.every((inv) => ["approved", "synced"].includes(inv.status)) && row.invoices.some((inv) => inv.status !== "synced") && (
                      <tr><td colSpan={7} className="px-4 py-3 text-sm text-[#1D4ED8]">All invoices reviewed! Ready to sync.</td></tr>
                    )}
                    {row.invoices.every((inv) => inv.status === "synced") && (
                      <tr><td colSpan={7} className="px-4 py-3 text-sm text-[#065F46]">
                        <span className="inline-flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Batch complete — all invoices synced to QuickBooks.
                        </span>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      );
    }

    // Individual row — render exactly as before
    const invoice = row.invoices[0];
    return (
      <tr key={invoice.id} className="border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group cursor-pointer" onClick={() => router.push(`/invoices/${invoice.id}/review`)}>
        {/* ... existing individual row cells ... */}
      </tr>
    );
  })}
</tbody>
```

Apply the same pattern for the mobile cards section, rendering `BatchHeader` as a card for batch rows.

**Important:** Extract the invoice row cells into a helper function to avoid duplication between batch and individual rows.

- [ ] **Step 4: Update the invoices page to parse `batch_id` and pass it**

In `app/(dashboard)/invoices/page.tsx`:

1. Add `batch_id` to the `searchParams` interface:
```typescript
interface InvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    limit?: string;
    output_type?: string;
    batch_id?: string;  // <-- add
  }>;
}
```

2. Pass `batch_id` to `validateListParams`:
```typescript
const params = validateListParams({
  ...existing params...,
  batch_id: resolvedParams.batch_id,
});
```

3. Pass `currentBatchId` to `InvoiceList`:
```tsx
<InvoiceList
  ...existing props...
  currentBatchId={params.batch_id}
/>
```

- [ ] **Step 5: Update the API route to support `batch_id`**

In `app/api/invoices/route.ts`, add `batch_id` and the missing `output_type` to the params being parsed:

```typescript
const params = validateListParams({
  status: searchParams.get("status") ?? undefined,
  sort: searchParams.get("sort") ?? undefined,
  direction: searchParams.get("direction") ?? undefined,
  cursor: searchParams.get("cursor") ?? undefined,
  limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
  output_type: searchParams.get("output_type") ?? undefined,
  batch_id: searchParams.get("batch_id") ?? undefined,
});
```

Note: `output_type` was missing from the API route (pre-existing gap) — fixing it alongside `batch_id` for consistency.

- [ ] **Step 6: Run type check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/invoices/InvoiceList.tsx app/(dashboard)/invoices/page.tsx app/api/invoices/route.ts
git commit -m "feat(DOC-70): integrate batch grouping into invoice list with Realtime"
```

---

## Task 6: Review Page — Batch Navigation Integration

**Files:**
- Modify: `app/(dashboard)/invoices/[id]/review/page.tsx`

- [ ] **Step 1: Add `batch_id` to invoice select and fetch manifest**

In the review page server component, update the invoice select to include `batch_id`:

```typescript
const { data: invoice, error: invoiceError } = await supabase
  .from("invoices")
  .select("id, status, file_path, file_name, file_type, error_message, output_type, payment_account_id, payment_account_name, batch_id")
  .eq("id", params.id)
  .single();
```

After the invoice fetch, conditionally fetch the batch manifest:

```typescript
import { fetchBatchManifest } from "@/lib/invoices/queries";
import BatchNavigation from "@/components/invoices/BatchNavigation";

// After invoice fetch succeeds, before the processing status check:
let batchManifest: Awaited<ReturnType<typeof fetchBatchManifest>> = [];
if (invoice.batch_id) {
  batchManifest = await fetchBatchManifest(supabase, invoice.batch_id);
}
```

- [ ] **Step 2: Render BatchNavigation in both processing and review states**

Wrap the processing state return in a fragment that includes BatchNavigation:

```tsx
if (PROCESSING_STATUSES.includes(invoice.status as InvoiceStatus)) {
  return (
    <>
      {invoice.batch_id && batchManifest.length > 1 && (
        <BatchNavigation
          currentInvoiceId={invoice.id}
          batchId={invoice.batch_id}
          initialManifest={batchManifest}
        />
      )}
      <ReviewProcessingState
        invoiceId={invoice.id}
        initialStatus={invoice.status as InvoiceStatus}
      />
    </>
  );
}
```

And wrap the ReviewLayout return similarly:

```tsx
return (
  <>
    {invoice.batch_id && batchManifest.length > 1 && (
      <BatchNavigation
        currentInvoiceId={invoice.id}
        batchId={invoice.batch_id}
        initialManifest={batchManifest}
      />
    )}
    <ReviewLayout
      ...existing props...
    />
  </>
);
```

- [ ] **Step 3: Add redirect-after-last-review logic**

The approve flow works via `ActionBar.onStatusChange("approved")` → `ExtractionForm.handleStatusChange`. The cleanest integration point is in `ExtractionForm`, which already handles status transitions.

**3a. Thread `batchId` through ReviewLayout to ExtractionForm:**

In `components/invoices/ReviewLayout.tsx`, add `batchId` to the `ReviewLayoutProps.invoice` interface:

```typescript
interface ReviewLayoutProps {
  invoice: {
    // ... existing fields ...
    batchId: string | null;  // <-- add
  };
  // ... rest unchanged ...
}
```

Pass it through to ExtractionForm (already rendered inside ReviewLayout):

```tsx
<ExtractionForm
  ...existing props...
  batchId={invoice.batchId}
/>
```

**3b. Add `batchId` and `batchManifest` props to ExtractionForm:**

In `components/invoices/ExtractionForm.tsx`, add to `ExtractionFormProps`:

```typescript
interface ExtractionFormProps {
  // ... existing fields ...
  batchId?: string | null;
  batchManifest?: { id: string; status: string }[];
}
```

**3c. Add redirect logic in `handleStatusChange`:**

In `ExtractionForm`, update `handleStatusChange` (currently at line 115):

```typescript
const handleStatusChange = useCallback((newStatus: InvoiceStatus) => {
  setCurrentStatus(newStatus);
  if (newStatus === "synced") {
    setSyncKey((k) => k + 1);
  }
  // After approve, check if this was the last unreviewed invoice in the batch
  if (newStatus === "approved" && batchId && batchManifest) {
    const remaining = batchManifest.filter(
      (m) => m.id !== invoiceId &&
        ["pending_review", "uploaded", "extracting", "error"].includes(m.status)
    );
    if (remaining.length === 0) {
      router.push(`/invoices?batch_id=${batchId}&toast=all-reviewed`);
    }
  }
}, [batchId, batchManifest, invoiceId, router]);
```

Note: `router` is already available in ExtractionForm — add `import { useRouter } from "next/navigation"` and `const router = useRouter()` if not already present.

**3d. Pass batchId and manifest from the review page:**

In `app/(dashboard)/invoices/[id]/review/page.tsx`, the `ReviewLayout` call becomes:

```tsx
<ReviewLayout
  invoice={{
    ...existing fields...
    batchId: invoice.batch_id ?? null,
  }}
  ...existing props...
  batchManifest={batchManifest}
/>
```

And thread `batchManifest` from `ReviewLayout` to `ExtractionForm`:

```tsx
// In ReviewLayout, add batchManifest to props and pass to ExtractionForm
<ExtractionForm
  ...existing props...
  batchId={invoice.batchId}
  batchManifest={batchManifest}
/>
```

**3e. Add toast display on the invoice list page:**

In `app/(dashboard)/invoices/page.tsx`, read the `toast` param and pass it to `InvoiceList`:

```typescript
const toastMessage = resolvedParams.toast === "all-reviewed"
  ? "All invoices reviewed!"
  : null;
```

In `InvoiceList`, add a `toastMessage` prop and render it:

```tsx
{toastMessage && (
  <div className="mb-4 px-4 py-3 rounded-md bg-[#D1FAE5] text-[#065F46] text-sm font-medium flex items-center gap-2">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {toastMessage}
  </div>
)}
```

- [ ] **Step 4: Run type check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/invoices/[id]/review/page.tsx"
git commit -m "feat(DOC-70): integrate BatchNavigation into review page"
```

---

## Task 7: Update Existing Tests

**Files:**
- Modify: `app/api/invoices/route.test.ts`

- [ ] **Step 1: Update API route test for batch_id param**

In `app/api/invoices/route.test.ts`, add a test case for the `batch_id` parameter:

```typescript
it("passes batch_id to validateListParams when present", async () => {
  const request = createMockRequest({ batch_id: "550e8400-e29b-41d4-a716-446655440000" });
  await GET(request as unknown as NextRequest);

  expect(validateListParams).toHaveBeenCalledWith(
    expect.objectContaining({
      batch_id: "550e8400-e29b-41d4-a716-446655440000",
    })
  );
});
```

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: PASS — all existing and new tests green

- [ ] **Step 3: Commit**

```bash
git add app/api/invoices/route.test.ts
git commit -m "test(DOC-70): add batch_id parameter test for invoice list API"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full completion self-check**

```bash
npm run lint
npm run build
npx tsc --noEmit
npm run test
```

All must pass clean.

- [ ] **Step 2: Verify no `any` types in new code**

Grep for `any` in new/modified files:
```bash
grep -n ': any' lib/invoices/batch-utils.ts components/invoices/BatchHeader.tsx components/invoices/BatchNavigation.tsx
```
Expected: no results

- [ ] **Step 3: Verify no console.log in new code**

```bash
grep -n 'console.log' lib/invoices/batch-utils.ts components/invoices/BatchHeader.tsx components/invoices/BatchNavigation.tsx
```
Expected: no results

- [ ] **Step 4: Commit any final fixes and deliver status report**
