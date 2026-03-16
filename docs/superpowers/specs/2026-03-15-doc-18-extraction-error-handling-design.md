# DOC-18: Error Handling for Extraction Pipeline

## Summary

Implement the retry API route and tighten error messages across the extraction pipeline. Most error handling already exists from DOC-14/DOC-16 — this issue fills the remaining gaps.

## What Already Works

- `claude.ts`: catches timeout, rate limit, API errors, malformed JSON, refusals
- `run.ts`: catches storage failures, file fetch failures, DB write failures; sets invoice status to `error` with message; increments `retry_count`
- Anthropic SDK handles rate limit retries with exponential backoff (3 retries) at SDK level
- Partial extraction: `confidence: 'low'` flows through to `pending_review` status

## Changes

### 1. Retry Route — `POST /api/invoices/[id]/retry`

New API route replacing the current 501 stub.

**Flow:**
1. Auth check (Supabase server client)
2. Ownership check via RLS (server client query)
3. Status guard: only `error` status allowed → 409 "Invoice is not in an error state"
4. Max retry guard: `retry_count >= 3` → 422 with "Extraction failed after 3 attempts. You can enter this invoice manually."
5. Delete stale `extracted_data` and `extracted_line_items` from prior failed attempt (admin client) — needed because `extracted_data` has a unique constraint on `invoice_id`
6. Set status to `extracting` (admin client)
7. Delegate to `runExtraction()`
8. Return extracted data on success, error response on failure

**Response codes:**
- 200: extraction succeeded, returns `{ data: ExtractedInvoice }`
- 401: not authenticated
- 404: invoice not found (or not owned by user, via RLS)
- 409: invoice not in `error` status
- 422: max retries (3) exhausted
- 500: extraction failed (invoice status set to `error` by `run.ts`)

### 2. Error Message Tightening in `run.ts`

Update the signed URL failure message:
- Before: "Failed to generate signed URL: {error}"
- After: "Failed to retrieve uploaded file"

Update the file fetch failure message:
- Before: "Failed to fetch file: HTTP {status}"
- After: "Failed to retrieve uploaded file"

These are internal storage failures that the user can't act on — a generic "Failed to retrieve uploaded file" is more appropriate than leaking HTTP status codes or internal bucket details.

### 3. Add `unprocessableEntity()` helper to `errors.ts`

Add `UNPROCESSABLE` to the `ErrorCode` union and a `unprocessableEntity()` helper returning 422. Used by the retry route for max retries exhausted.

### 4. Clean up stale extraction data in `run.ts`

Add a cleanup step at the start of `runExtraction()` that deletes any existing `extracted_line_items` (via `extracted_data_id`) and `extracted_data` for the invoice before inserting fresh results. This prevents unique constraint violations on retry and keeps the extract route safe too.

### 5. No Changes Needed

- `claude.ts` error handling — already matches DOC-18 spec
- Partial extraction — already saves what it gets with `confidence: 'low'`
- Rate limit backoff — already handled by Anthropic SDK (`maxRetries: 3`)
- `retry_count` increment — already in `run.ts` catch block
- `extract/route.ts` — existing route already handles manual re-extraction

### 6. Tests

**Retry route tests (`app/api/invoices/[id]/retry/route.test.ts`):**
- Happy path: errored invoice, retry_count=0 → calls runExtraction, returns data
- Max retries: retry_count=3 → 422 with user-friendly message
- Wrong status: invoice in `pending_review` → 409 conflict
- Auth failure → 401
- Invoice not found → 404
- Extraction fails during retry → 500

**Existing test updates:**
- `run.test.ts`: update error message assertions for signed URL and file fetch failures (now both "Failed to retrieve uploaded file"); add test for stale data cleanup before extraction

## Error Message Matrix

| Failure Mode | Error Message | Status |
|---|---|---|
| Storage download fails | "Failed to retrieve uploaded file" | error |
| Claude API timeout | "Extraction timed out. Please retry." | error |
| Claude rate limit | Handled by SDK (3 retries w/ backoff), then "Extraction service is busy. Please retry in a moment." | error |
| Malformed AI response | "Could not parse extraction results. Raw response: {first 200 chars}" | error |
| Claude refusal/empty | "Could not extract data from this document. The file may be unreadable or unsupported." | error |
| Partial extraction | (no error — saves what it got) | pending_review |
| DB write failure | "Failed to store extraction results: {error}" | error |
| Max retries exhausted | "Extraction failed after 3 attempts. You can enter this invoice manually." | error |

## Known Limitations (MVP)

- **Race condition on retry_count:** The retry_count check and extraction are not atomic. Two simultaneous retry requests could both pass the guard. Mitigated by the `extracting` status guard in the extract route, and by MVP having <10 users. Not worth adding a database lock for this scale.
