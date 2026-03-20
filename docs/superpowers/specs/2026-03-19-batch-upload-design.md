# Batch Upload & Async Extraction — Design Spec

**Date:** 2026-03-19
**Project:** Batch Upload & Async Extraction
**Linear Project:** [Batch Upload & Async Extraction](https://linear.app/jkbtech/project/batch-upload-async-extraction)
**Status:** Reviewed (CEO review passed)
**Review mode:** Selective Expansion

---

## Problem

Docket currently handles one invoice at a time: upload, wait ~4 seconds for extraction, review, approve, sync. Small businesses process invoices in batches — a stack of 10-25 arrives weekly from vendors. The single-file workflow forces 25 repetitive upload-wait-review cycles and 50 clicks to approve and sync them all.

## Solution

Multi-file upload (up to 25 files per batch) with concurrent background extraction, a batch status dashboard, and batch approve/sync actions. The entire end-to-end flow becomes: drop 25 files → watch them extract in real-time → review each one → approve all → sync all to QuickBooks.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extraction model | Async via `waitUntil()` + `p-limit(5)` concurrency | 25 files x 4s = 100s synchronous. Concurrency control caps at 5 parallel Claude calls. Stays on Vercel API routes (Architecture Rule #1). |
| Status updates | Supabase Realtime (existing `useInvoiceStatus` hook) | Already in place for single-file. Extend to multi-invoice subscriptions. No polling endpoints. |
| Batch identity | `batch_id` UUID column on `invoices` table (nullable) | Lightweight grouping. No separate `batches` table. Single-file uploads have `batch_id = NULL`. Client generates the UUID. |
| Upload architecture | Each file = separate `POST /api/invoices/upload` request | Works within Vercel's 4.5MB body limit. Client manages 3-concurrent upload queue. Server route stays single-file. |
| Batch size cap | 25 files max per batch | Server-side enforcement on `batch_id` count. Balances UX with resource limits. |
| Single-file migration | Merged into BAT-1 (no separate issue) | Single-file upload uses same `enqueueExtraction()` path — upload returns immediately, no 4-second wait. Backward compatible. |
| Batch sync strategy | Sequential, not parallel | QBO rate limits (500 calls/hr) and token refresh needs make sequential safer. 25 invoices x ~1s = ~25s with Realtime progress UI. |
| Batch approve | Server-side field validation, skip invalid | Same required-field check as single approve (`vendor_name` + `total_amount`). Returns structured result with skip reasons. |

## Architecture

### Status Flow

```
uploading → uploaded → extracting → pending_review → approved → synced
                                  ↘ error (retry available)
```

The `uploaded` status is new — means "file is in Storage, extraction hasn't started yet." This decouples upload from extraction.

### Concurrency Model

```
Client (3 concurrent uploads)
  → POST /api/invoices/upload (returns immediately after Storage write)
    → waitUntil(enqueueExtraction(...))
      → p-limit(5) queue
        → runExtraction() (calls Claude Vision)
          → DB status update (triggers Realtime to client)
```

- **Client-side:** 3 concurrent uploads (browser connection limit friendly)
- **Server-side:** 5 concurrent extractions via `p-limit` (within a single `waitUntil` invocation)
- **Semaphore timeout:** 120s — if extraction slot isn't available, set `status = 'error'`
- **Double-extraction guard:** Check if invoice is already `extracting` before starting

### Realtime Updates

The existing `useInvoiceStatus` hook subscribes to Supabase Realtime channel for invoice status changes. BAT-1 extends it to accept `invoiceIds: string[]` for multi-invoice subscriptions. Returns `Record<string, { status, errorMessage }>`.

No polling endpoints are built. Realtime subscriptions stop when all visible invoices reach terminal states.

### Batch Sync

Batch sync uses fire-and-forget via `waitUntil()`:
1. Route validates batch, checks QBO connection, returns immediately with `{ syncing: count }`
2. Background: processes invoices sequentially (not parallel)
3. Per invoice: check token validity → idempotency guard → create bill → attach PDF → update status
4. Individual failures don't stop the batch — continue processing, report all failures at end
5. QBO rate limit (429): exponential backoff (5s → 10s → 20s → 40s → 60s max)

## Build Sequence

| Order | Issue | Title | Depends On |
|-------|-------|-------|------------|
| 1 | DOC-68 | BAT-1: Async extraction infrastructure + single-file migration | None |
| 2 | DOC-69 | BAT-2: Multi-file upload UI (enhance UploadZone for batch) | DOC-68 |
| 3 | DOC-70 | BAT-3: Batch status dashboard (track extraction progress) | DOC-68, DOC-69 |
| 4 | DOC-83 | BAT-5: Batch approve + batch sync to QuickBooks | DOC-68, DOC-70 |

DOC-71 (BAT-4) was merged into DOC-68 during review — single-file migration is part of the async infrastructure work.

Each Linear issue contains the full spec: context, numbered tasks, acceptance criteria, constraints, files likely touched, and dependencies. They are standalone deliverables — any agent can pick one up and build it.

## New Dependencies

| Package | Purpose |
|---------|---------|
| `p-limit` | Zero-dependency concurrency limiter for extraction queue |

## Database Changes

```sql
-- BAT-1: Add uploaded status and batch_id
ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('uploading', 'uploaded', 'extracting', 'pending_review', 'approved', 'synced', 'error'));

ALTER TABLE invoices ADD COLUMN batch_id UUID;
CREATE INDEX idx_invoices_batch_id ON invoices(batch_id);
```

No new tables. `batch_id` is a lightweight grouping mechanism on the existing `invoices` table.

## Error Handling

| Scenario | Handling |
|----------|----------|
| >25 files dropped | Client-side warning: "Maximum 25 files per upload." |
| >25 files with same batch_id (server) | 400: "Batch limit reached (25 files maximum)." |
| Extraction queue timeout (120s) | Set `status = 'error'`, message: "Extraction queue timed out. Please retry." |
| Double extraction trigger | Skip if already `extracting` (guard in `runExtraction`) |
| DB insert fails after Storage upload | Delete orphaned file from Storage |
| Batch approve — missing required fields | Skip invoice, include in `skippedInvoices` response with reason |
| Batch sync — individual QBO failure | Log to `sync_log`, set invoice `status = 'error'`, continue to next |
| Batch sync — QBO rate limit (429) | Exponential backoff, resume after wait |
| Batch sync — token expiry mid-batch | Refresh token if expiring within 5 minutes (checked per-invoice) |
| User closes tab mid-upload | Partial batch accepted — whatever uploaded is the batch |
| User closes tab mid-sync | `waitUntil` continues server-side — invoices sync and status updates persist |
