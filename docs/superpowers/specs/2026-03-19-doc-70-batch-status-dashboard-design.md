# DOC-70: Batch Status Dashboard — Design Spec

**Date:** 2026-03-19
**Linear Issue:** [DOC-70](https://linear.app/jkbtech/issue/DOC-70)
**Dependencies:** DOC-68 (async extraction + batch_id), DOC-69 (multi-file upload UI)

## Overview

After uploading a batch of invoices (5–25 files), users need to track extraction progress, work through reviews efficiently, and retry failures. This issue adds batch-aware grouping to the existing invoice list page and batch navigation to the review page.

**Approach:** Client-side grouping. The server returns a flat list of invoices (unchanged API shape). The client groups invoices sharing a `batch_id` into accordion sections. No new tables, no new API response formats.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Grouping strategy | Client-side grouping of flat list | Batch is a UI convenience, not a core data model. Keeps server simple. |
| Accordion behavior | Collapsed by default | Keeps list compact when multiple batches exist. |
| Batch header content | Count + status pills only | Simplicity wins. Users expand to see filenames. |
| Review nav on extracting invoice | Land on it, show progress, auto-transition | Keeps users in flow without missing anything. |
| After last review | Redirect to filtered list + success toast | Next step is batch-level actions (Approve All/Sync All from DOC-83), which live on the list page. |
| Retry execution | Sequential, not parallel | Avoids hammering the extraction queue. |

---

## 1. Invoice List — Batch Accordion

### Grouping Logic

The `InvoiceList` component receives the existing flat invoice array from the server. Client-side logic:

1. Group invoices by `batch_id` — invoices with the same non-null `batch_id` form a group.
2. Invoices with `batch_id = null` render as individual rows (unchanged from today).
3. Groups are positioned in the list by the earliest `uploaded_at` of their member invoices.
4. Within a group, invoices are sorted by `uploaded_at` ascending (upload order).

### Collapsed State (Default)

A single row representing the batch:

```
[▶ chevron]  Batch uploaded Mar 18 — 12 invoices    [8 ready · 3 extracting · 1 failed]    [Review Next]
```

- **Left:** Chevron icon (rotates on expand), batch label with relative date and invoice count.
- **Center-right:** Status pills — colored inline badges showing non-zero status counts:
  - Blue pulsing: "N extracting"
  - Amber: "N ready for review"
  - Green: "N synced"
  - Red: "N failed"
- **Right:** Action buttons (see Section 2).

### Expanded State

Click the row or chevron to expand. Reveals individual invoice rows:

- Indented slightly from the batch header with a subtle left border (e.g., `border-l-2 border-blue-200`)
- Each row shows the same columns as today: filename, vendor, invoice #, date, amount, status, uploaded
- Clicking a row navigates to the review page (unchanged)
- Empty state messages appear below the invoice rows when applicable (see Section 4)

### Auto-Expand Rules

- `?batch_id=UUID` filter active → auto-expanded (user is viewing a specific batch)
- All other cases → collapsed by default
- Expand/collapse state is client-only, not persisted in URL

### Page Boundary Handling

- **Unfiltered list:** If a batch straddles a page boundary (cursor-based pagination, 25 per page), show whichever invoices fall on the current page. Batch header says "Showing 5 of 12" with a "View all" link that navigates to `?batch_id=X`.
- **Filtered view (`?batch_id=X`):** Returns ALL invoices in that batch with no pagination cap. Safe because batches are capped at 25 files (enforced by DOC-68).

### Filter Interaction

- **Status filter tabs** (All, Pending Review, Approved, etc.): When a status filter is active, batch groups still appear but only show invoices matching that status. If no invoices in a batch match the filter, the batch group is hidden.
- **`?batch_id=UUID` parameter:** When present, only show invoices from that batch. Batch header still shows full summary. Combines with status filters (e.g., `?batch_id=X&status=error` shows only failed invoices in that batch).

---

## 2. Batch Header Actions

Action buttons appear on the right side of the batch header row, visible in both collapsed and expanded states.

### "Review Next" Button

- **Style:** Primary (blue), compact size.
- **Visible when:** At least one invoice in the batch has `status = 'pending_review'`.
- **Click behavior:** Navigate to the first `pending_review` invoice in the batch (sorted by `uploaded_at` ascending). URL: `/invoices/{id}/review`.
- **Disabled states:**
  - All invoices reviewed (approved/synced): disabled, tooltip "All reviewed"
  - All non-terminal invoices still extracting: disabled, tooltip "Waiting for extraction"

### "Retry All Failed" Button

- **Style:** Outline danger (red border, red text), compact size.
- **Visible when:** At least one invoice in the batch has `status = 'error'`.
- **Hidden when:** No failed invoices.
- **Label:** "Retry N Failed" where N is the count of failed invoices.
- **Click behavior:** Calls `POST /api/invoices/[id]/retry` for each failed invoice, sequentially (one at a time to avoid hammering the extraction queue).
- **In-progress state:** Button disabled, label changes to "Retrying…" with spinner.
- **Completion:** Button re-evaluates visibility based on updated statuses (Realtime will update).

---

## 3. Review Page — Batch Navigation

When viewing a review page for an invoice with a non-null `batch_id`, a navigation bar appears at the top of the page, above the existing PDF + form layout.

### Navigation Bar Layout

```
[← Back to batch]          Invoice 5 of 12          [◀ Previous] [Next ▶]
```

- **Left:** Back arrow + "Back to batch" — navigates to `?batch_id=X` filtered invoice list.
- **Center:** "Invoice N of M" — position in upload order within the batch.
- **Right:** Previous / Next buttons (chevron/arrow style).

### Navigation Logic

**"Next" button:**
1. Find the next invoice in upload order (`uploaded_at` ascending).
2. If `pending_review` → navigate to its review page.
3. If `uploaded` or `extracting` → navigate to its review page (shows extraction progress via existing `ReviewProcessingState`, auto-transitions to review form on completion).
4. If `approved` or `synced` → skip, jump to the next invoice that is `pending_review`, `uploaded`, or `extracting`.
5. If no more eligible invoices → disabled.

**"Previous" button:**
- Goes to the prior invoice in upload order regardless of status (so users can re-check approved invoices).
- Disabled on the first invoice in the batch.

### After Approving the Last Unreviewed Invoice

When the user approves an invoice and no `pending_review`, `uploaded`, or `extracting` invoices remain in the batch:

1. Redirect to `?batch_id=X` filtered invoice list.
2. Show a success toast: "All invoices reviewed!"

### Data Fetching

On mount, the review page fetches the batch manifest — a lightweight query returning `{ id, status, uploaded_at }` for all invoices in the batch. This powers:
- "Invoice N of M" counter
- Previous/Next navigation decisions
- "Last invoice" detection for redirect logic

This is a single Supabase query: `select('id, status, uploaded_at').eq('batch_id', batchId).order('uploaded_at')`.

### Non-Batch Invoices

If the invoice's `batch_id` is null, no navigation bar appears. The review page works exactly as it does today.

---

## 4. Realtime Updates

### Invoice List Realtime

The `InvoiceList` component uses the existing `useInvoiceStatuses` hook (from DOC-68) to subscribe to status changes for invoices in non-terminal states.

**Subscription strategy:**
1. On mount/data change: collect invoice IDs from all batches that have at least one invoice in `uploaded` or `extracting` status.
2. Pass these IDs to `useInvoiceStatuses` for Realtime subscription.
3. As statuses update, batch header pills re-render live (e.g., "3 extracting" → "2 extracting", "9 ready" → "10 ready").
4. When all invoices in a batch reach terminal states (`pending_review`, `approved`, `synced`, `error`), remove those IDs from the subscription set.

**Works for collapsed batches too** — the status pills in the collapsed header row update without expanding.

### Review Page Realtime

Already handled by the existing `useInvoiceStatus` single-invoice hook and `ReviewProcessingState` component. When batch navigation lands on an extracting invoice, the existing progress UI shows and auto-transitions when extraction completes.

The batch manifest (for the navigation bar) is refreshed when a Realtime update changes any invoice's status in the batch, so the "Invoice N of M" counter and Next logic stay accurate.

---

## 5. Empty States

Empty state messages appear inside the expanded accordion area, below the individual invoice rows.

| Condition | Message | Visual | Action |
|-----------|---------|--------|--------|
| All extractions failed | "All extractions failed. Check file quality and retry." | Red text/icon | "Retry All Failed" button (already in header) |
| All invoices reviewed (approved) | "All invoices reviewed! Ready to sync." | Blue text/icon | Future: "Sync All" from DOC-83 |
| All invoices synced | "Batch complete — all invoices synced to QuickBooks." | Green checkmark | None — terminal state |

---

## 6. Files to Modify/Create

| File | Change |
|------|--------|
| `components/invoices/InvoiceList.tsx` | Client-side batch grouping, accordion UI, Realtime integration |
| `components/invoices/BatchHeader.tsx` | **New.** Batch summary row with status pills and action buttons |
| `components/invoices/BatchNavigation.tsx` | **New.** Review page navigation bar (Back, N of M, Previous/Next) |
| `app/(dashboard)/invoices/page.tsx` | Accept `batch_id` query parameter, pass to InvoiceList |
| `app/api/invoices/route.ts` | Support `batch_id` filter parameter in query |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Fetch batch manifest, render BatchNavigation, handle redirect after last review |
| `lib/invoices/queries.ts` | Add `fetchBatchManifest(batchId)` query helper |

---

## 7. Non-Goals

- **No separate `batches` table.** Batch identity is a lightweight `batch_id` grouping on the invoices table.
- **No batch-level approve/sync.** That's DOC-83.
- **No polling.** All status updates via Supabase Realtime.
- **No new API response shapes.** Server returns flat invoice list; client groups.
