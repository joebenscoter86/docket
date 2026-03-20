# DOC-83: Batch Approve + Batch Sync to QuickBooks — Design Spec

## Overview

Adds "Approve All Reviewed" and "Sync All to QuickBooks" batch actions to the batch dashboard, completing the end-to-end batch workflow: Upload → Extract → Review → Approve All → Sync All.

## Batch Approve Endpoint

**Route:** `POST /api/invoices/batch/approve`

**Request:** `{ batch_id: string }`

**Flow:**
1. Authenticate user, resolve org via `org_memberships`
2. Check subscription access via `checkInvoiceAccess(user.id)` — return 403 if inactive
3. Validate `batch_id` is a valid UUID
3. Fetch all invoices with this `batch_id` — verify every invoice belongs to the user's org (Architecture Rule #10)
4. Filter to `status = 'pending_review'` (already-approved/synced invoices silently skipped)
5. For each candidate: validate `vendor_name` and `total_amount` are non-null in `extracted_data`
6. Approve passing invoices: set `status = 'approved'`
7. Skip failing invoices: collect `{ id, fileName, reason }`

**Response:** `{ approved: number, skipped: number, skippedInvoices: Array<{ id: string, fileName: string, reason: string }> }`

**Characteristics:**
- Synchronous — approve is a DB update, no external API calls
- Idempotent — already-approved invoices silently skipped
- Double-click protection is client-side only (no server-side lock needed for fast DB ops)
- Single `revalidatePath("/invoices")` after all updates

**Logging:**
- Entry: `{ action: "batch_approve", batchId, invoiceCount, orgId, userId }`
- Exit: `{ action: "batch_approve_complete", batchId, approved, skipped, durationMs }`

## Batch Sync Endpoint

**Route:** `POST /api/invoices/batch/sync`

**Request:** `{ batch_id: string }`

**Immediate flow (before `waitUntil`):**
1. Authenticate user, resolve org
2. Check subscription access via `checkInvoiceAccess(user.id)` — return 403 if inactive
3. Validate `batch_id` is a valid UUID
4. Verify org ownership of all batch invoices
5. Check for active QBO connection — if none, return 400: "Connect QuickBooks in Settings first."
6. Fetch `approved` invoices in batch (full invoice record including `output_type` and `payment_account_id`)
7. Pre-flight validation per invoice: `vendor_ref` present, at least 1 line item, all line items have `gl_account_id`. For non-bill types (check/cash/credit_card), `payment_account_id` must be present. Skip unmapped invoices.
8. Return immediately: `{ syncing: number, skipped: number, skippedInvoices: Array<{ id: string, fileName: string, reason: string }>, invoiceIds: string[] }`

**Background flow (inside `waitUntil`):**

Process invoices sequentially (not parallel — QBO rate limits at 500 calls/hr):

For each invoice:
1. **Token check:** call `getValidAccessToken(orgId)` which auto-refreshes if expiring within 5 minutes
2. **Idempotency guard:** check `sync_log` for existing successful sync with matching `invoice_id` + `provider` + `transaction_type`. If found, skip.
3. **Create bill/purchase:** read `output_type` and `payment_account_id` from the invoice record. Call `createBill` (default/bill) or `createPurchase` (check/cash/credit_card) accordingly (reuses existing QBO API wrapper)
4. **Attach PDF:** call `attachPdfToEntity` (best-effort — partial success if attachment fails)
5. **Update status:** set invoice `status = 'synced'` (triggers Supabase Realtime → client updates)
6. **Log:** insert `sync_log` row with `status = 'success'`

On error per invoice:
1. Insert `sync_log` row with `status = 'failed'` + error details
2. Set invoice `status = 'error'` with `error_message` (triggers Realtime)
3. **Continue to next invoice** — never stop the batch on individual failures

On QBO rate limit (429):
1. Exponential backoff: 5s → 10s → 20s → 40s → 60s cap
2. Log warning: `{ action: "batch_sync_rate_limited", batchId, waitSeconds }`
3. Resume after backoff

**Logging:**
- Entry: `{ action: "batch_sync_start", batchId, invoiceCount, syncing, skipped, orgId, userId }`
- Exit: `{ action: "batch_sync_complete", batchId, synced, failed, totalMs }`

## UI Changes

### BatchHeader — New Buttons

Two buttons added to the existing `BatchHeader` component, positioned after the existing "Retry All Failed" and "Review Next" buttons.

**"Approve N Ready" button:**
- Visible when `readyForReview > 0` in `BatchStatusSummary`
- Shows count: "Approve 15 Ready"
- Disabled immediately on click (client-side double-click protection)
- On success: toast with "15 approved, 3 skipped (missing required fields)"
- Skipped invoices: expandable detail in toast showing invoice name + reason
- Button disappears when no more `pending_review` invoices

**"Sync N to QuickBooks" button:**
- Visible when `approved > 0` AND org has active QBO connection
- Shows count: "Sync 15 to QuickBooks"
- Disabled immediately on click
- After click: button text → "Syncing..." with spinner
- Progress tracked via existing `useInvoiceStatuses` Realtime hook
- Batch header summary updates live: "12 of 15 synced..."
- On completion: result summary toast ("15 synced, 2 failed")
- Failed invoices show individual errors and can be retried individually via existing retry

**Sync progress tracking:**
- On sync API response, store `invoiceIds` in component local state
- Derive progress from `useInvoiceStatuses`: count invoices that reached `synced` or `error` vs total
- Completion detected when `synced + failed === total invoiceIds`
- On completion: show result toast, call `router.refresh()` to sync server-rendered state

**QBO connection awareness:**
- BatchHeader needs to know if QBO is connected to show/hide the sync button
- Pass `isQboConnected` prop from parent (already available in the invoices page server component via `isConnected()`)

### Batch Completion Banner

When ALL invoices in a batch reach `synced` status, show a completion banner within the batch accordion:
- Green checkmark + "Batch complete — N invoices synced to QuickBooks"
- This partially exists already in InvoiceList's batch empty states — refine to be a proper banner

### Per-Invoice Status in Batch View

During batch sync, each invoice row in the batch shows real-time status:
- `approved` → "Syncing..." (when sync is in progress for the batch)
- `synced` → green "Synced" badge (existing `InvoiceStatusBadge`)
- `error` → red "Failed" badge with error message

This already works via `useInvoiceStatuses` — no new Realtime infrastructure needed.

## Validation Rules Summary

### Batch Approve — per-invoice validation
| Field | Rule | Skip reason |
|-------|------|-------------|
| `vendor_name` | Must be non-null in `extracted_data` | "Missing vendor name" |
| `total_amount` | Must be non-null in `extracted_data` | "Missing total amount" |

### Batch Sync — pre-flight validation (before `waitUntil`)
| Field | Rule | Skip reason |
|-------|------|-------------|
| `vendor_ref` | Must be non-null in `extracted_data` | "No QuickBooks vendor mapped" |
| Line items | At least 1 must exist | "No line items" |
| `gl_account_id` | All line items must have it | "Line items missing GL account mapping" |
| `payment_account_id` | Required if `output_type` is check/cash/credit_card | "Missing payment account for check/cash sync" |

## Code Reuse

| Existing code | Reused for |
|---------------|------------|
| Single approve validation (`vendor_name` + `total_amount` check) | Batch approve per-invoice validation |
| `createBill` / `createPurchase` in `lib/quickbooks/api.ts` | Batch sync bill/purchase creation |
| `attachPdfToEntity` in `lib/quickbooks/api.ts` | Batch sync PDF attachment |
| `getValidAccessToken` in `lib/quickbooks/auth.ts` | Token refresh per sync call |
| `sync_log` idempotency pattern from single sync | Batch sync idempotency guard |
| `useInvoiceStatuses` hook | Real-time progress tracking |
| `BatchStatusSummary` in `lib/invoices/batch-utils.ts` | Button visibility logic |
| `waitUntil` pattern from extraction | Fire-and-forget sync |

## Files

**New:**
- `app/api/invoices/batch/approve/route.ts` (~80 LOC)
- `app/api/invoices/batch/sync/route.ts` (~120 LOC)
- `app/api/invoices/batch/approve/route.test.ts`
- `app/api/invoices/batch/sync/route.test.ts`

**Modified:**
- `components/invoices/BatchHeader.tsx` — add Approve All + Sync All buttons, progress display
- `app/(dashboard)/invoices/page.tsx` — pass `isQboConnected` prop to BatchHeader

## Testing Strategy

**Batch approve tests:**
- Happy path: all invoices approved
- Mixed: some approved, some skipped (missing fields)
- Idempotent: already-approved invoices silently skipped
- Auth failure: returns 401
- Invalid batch_id: returns 400
- Org ownership: invoices from different org → rejected

**Batch sync tests:**
- Happy path: returns syncing count, fires waitUntil
- No QBO connection: returns 400
- Pre-flight skip: invoices missing vendor_ref skipped in response
- Auth failure: returns 401
- Invalid batch_id: returns 400
- Background sync logic tested via extracted helper functions (not route handler directly)
