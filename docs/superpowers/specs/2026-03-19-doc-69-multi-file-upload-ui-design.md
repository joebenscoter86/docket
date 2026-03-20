# DOC-69: Multi-File Upload UI Design

**Linear:** DOC-69 — BAT-2: Multi-file upload UI (enhance UploadZone for batch)
**Date:** 2026-03-19
**Depends on:** DOC-68 (async extraction infrastructure) — completed

## Overview

Enhance the existing upload flow to accept multiple files (up to 25), show per-file validation and progress, upload with controlled concurrency (3 at a time), track extraction status in real-time, and present a batch summary on completion. Single-file upload continues to work through the same component.

## Component Architecture

Extend existing components rather than creating parallel ones.

### UploadZone.tsx (modified)

- Accept `multiple` attribute on file input and drag-and-drop
- Manage a local file list: `Array<{ file: File, id: string, valid: boolean, error?: string }>`
- Validate each file synchronously on drop/select: type (PDF/JPEG/PNG by extension) and size (<=10MB)
- Allow multiple drops — append to list up to 25 total
- If drop would exceed 25, accept up to the cap and show warning: "Maximum 25 files per upload. N files were not added."
- Display file list with per-file validation status:
  - Valid: green check, filename, file size, remove button
  - Invalid: red X, filename struck through, error reason (e.g., "Unsupported format"), remove button, row has red tint background
- "Upload N Files" button where N = count of valid files only. Invalid files are skipped.
- Button disabled with "No valid files to upload" when all files are invalid
- Emit array of valid files when button is clicked via `onUploadStart(files)` callback

### UploadQueue.tsx (new)

- Receives array of files to upload
- Generates `batch_id` (UUID v4) client-side before first upload
- Manages upload concurrency via `p-limit(3)` — same pattern as extraction queue from DOC-68
- Each file uploaded as separate `POST /api/invoices/upload` with FormData containing file + `batch_id`
- Tracks per-file state: `uploading → uploaded → extracting → pending_review` or `error` at any stage
- Subscribes to `useInvoiceStatuses(invoiceIds)` for real-time extraction tracking once files are uploaded
- Per-file UI rows (64px height per UIdesign.md section 7.2):
  - File icon + filename + status text
  - 3px progress bar at bottom of row (blue while in progress, green on success)
  - "View →" link on completed files — navigates to `/invoices/{id}/review`
  - "Retry" button on failed files — re-uploads the file (new invoice row, same batch_id)
- Batch summary bar appears at top when all files are done:
  - "X of Y invoices uploaded successfully. Z failed."
  - "Review All →" button — navigates to `/invoices?batch_id={batchId}`
- Dropzone returns below the summary for starting a new batch
- `beforeunload` handler added when first upload starts, removed when all uploads + extractions complete or component unmounts

### UploadFlow.tsx (modified)

- Orchestrates transition between UploadZone and UploadQueue
- When UploadZone emits files:
  - 1 file → current single-file flow (upload + ExtractionProgress), no batch_id
  - Multiple files → render UploadQueue with the file array
- Single-file flow uses the same file list UI in UploadZone (one row) but skips batch_id

### Upload page (minimal changes)

- No structural changes. UploadFlow handles the routing between single and batch flows.

## Upload API Route Changes

Minimal changes to `POST /api/invoices/upload`:

### New in FormData
- `batch_id` (optional) — UUID v4 string, passed through to invoice row insert

### Server-side validation
- If `batch_id` present: validate UUID v4 format, count existing invoices with that `batch_id` — if >= 25, return 400 with `BATCH_LIMIT` error code and message "Batch limit reached. Maximum 25 files per batch."
- Monthly usage limit check unchanged (counts all invoices for the org, regardless of batch)

### Insert change
- Add `batch_id` to invoice row if provided, `null` otherwise

### Response unchanged
- Still returns `{ invoiceId, fileName, signedUrl }`
- Still triggers extraction via `waitUntil(enqueueExtraction())`

## Invoice List Filtering

When `/invoices?batch_id=xxx` is present in the URL:
- `fetchInvoiceList` adds `.eq('batch_id', batchId)` to the Supabase query
- No new API route — same server component, one extra filter condition
- No new page needed

## State Management

### File selection state (UploadZone)
- `selectedFiles` — local React state, no server calls
- Validation is synchronous on drop/select
- State resets when upload starts (files handed off to UploadQueue)

### Upload queue state (UploadQueue)
- `batchId` — UUID v4, generated once when upload starts
- `uploads: Map<string, { fileId, invoiceId?, status, progress }>` — per-file tracking
- Upload concurrency via `p-limit(3)`
- On upload success, stores returned `invoiceId`

### Real-time extraction tracking
- `useInvoiceStatuses(invoiceIds)` from DOC-68
- Returns `Record<string, { status, errorMessage }>` via Supabase Realtime
- Queue rows update in real-time as extraction progresses

### No global state
- Everything local to upload page components
- Invoice list queries by `batch_id` from URL param

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User drops 30 files | Accept first 25, reject extras with warning: "Maximum 25 files per upload. 5 files were not added." |
| User drops more files after initial selection | Append up to 25 total. If already at 25, show warning. |
| Mix of valid and invalid files | Invalid files shown in red with reason, grayed out. Button reads "Upload N Files" counting only valid. |
| All files invalid | Button disabled, reads "No valid files to upload" |
| Upload fails (network/server error) | Row shows red "Upload failed" + retry button. Other files continue. |
| Extraction fails | Row shows "Extraction failed" + retry button. Retry re-uploads (new invoice row, same batch_id). |
| User navigates away mid-upload | `beforeunload` shows native browser warning. Partial batch is fine — uploaded files exist in the system. |
| User closes and comes back | No resume. Uploaded files in invoice list. Un-uploaded files gone. No "expected count" tracking. |
| Usage limit hit mid-batch | API returns 400. Row shows "Monthly limit reached." Remaining queued files skipped with same message. |
| Single file dropped | Same component, no batch_id, file list UI with one row. |
| Duplicate file names | Allowed — each gets its own invoice ID. |

## Files Changed

| File | Change |
|------|--------|
| `components/invoices/UploadZone.tsx` | Multi-file support, file list UI, validation |
| `components/invoices/UploadQueue.tsx` | New — upload queue with concurrency, progress, batch summary |
| `components/invoices/UploadFlow.tsx` | Orchestrate single vs. batch flow |
| `app/api/invoices/upload/route.ts` | Accept optional `batch_id`, validate, insert |
| `app/(dashboard)/invoices/page.tsx` | Add `batch_id` query param filter to invoice list |

## Design References

- UIdesign.md section 7.2 — processing queue visual spec
- DOC-68 implementation plan — async extraction infrastructure, `useInvoiceStatuses` hook
- Existing Precision Flow design tokens from DOC-48
