# DOC-14: Extraction API Route — Design Spec

## Overview

Build the core AI extraction pipeline. When an invoice is uploaded, Claude Vision reads the document and returns structured data (vendor, dates, line items, totals). The extraction is auto-triggered from the upload route and stores results in `extracted_data` + `extracted_line_items` tables.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/extraction/types.ts` | Create | TypeScript types for extraction input/output |
| `lib/extraction/provider.ts` | Create | Provider-agnostic interface + factory function |
| `lib/extraction/claude.ts` | Create | Claude Vision implementation |
| `lib/extraction/run.ts` | Create | Shared `runExtraction()` orchestration function |
| `app/api/invoices/[id]/extract/route.ts` | Replace stub | API route for manual extraction/retry |
| `app/api/invoices/upload/route.ts` | Modify | Add auto-trigger call to `runExtraction()` |
| `package.json` | Modify | Add `@anthropic-ai/sdk` dependency |

## Type Definitions (`lib/extraction/types.ts`)

```typescript
export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
}

export interface ExtractedInvoice {
  vendorName: string | null;
  vendorAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;       // ISO YYYY-MM-DD
  dueDate: string | null;           // ISO YYYY-MM-DD
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;                 // ISO 4217, default "USD"
  paymentTerms: string | null;
  confidenceScore: "high" | "medium" | "low";
  lineItems: ExtractedLineItem[];
}

export interface ExtractionResult {
  data: ExtractedInvoice;
  rawResponse: Record<string, unknown>;  // full AI response for debugging
  modelVersion: string;                   // e.g. "claude-sonnet-4-20250514"
  durationMs: number;
}

export interface ExtractionProvider {
  extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<ExtractionResult>;
}
```

### Design decisions

- **`fileBuffer` + `mimeType` instead of `fileUrl`**: The provider receives the raw file bytes and MIME type rather than a URL. This keeps the provider decoupled from Supabase Storage — a future Google Document AI provider wouldn't need Supabase signed URLs. The orchestration layer (`run.ts`) handles fetching the file from Storage.
- **camelCase types, snake_case DB**: Types use TypeScript convention (camelCase). The orchestration layer maps to snake_case when writing to the database.
- **Deviation from CLAUDE.md interface**: CLAUDE.md specifies `extractInvoiceData(fileUrl): ExtractedInvoice`. This spec changes the signature to `extractInvoiceData(fileBuffer, mimeType): Promise<ExtractionResult>` — raw bytes decouple the provider from Storage, and `ExtractionResult` wraps the data with metadata (model version, duration). The CLAUDE.md Decisions Log should be updated.
- **New file `run.ts`**: Not in CLAUDE.md's folder structure. Added as orchestration layer to keep DB writes and status management out of both the API route and the provider. CLAUDE.md folder structure should be updated.

## Provider Interface (`lib/extraction/provider.ts`)

```typescript
export function getExtractionProvider(): ExtractionProvider
```

Factory function that returns the configured provider. Currently always returns `ClaudeExtractionProvider`. In the future, this reads from config/env to select the provider (e.g., `EXTRACTION_PROVIDER=google-docai`).

No abstract class, no registry pattern — just a function that returns an implementation. YAGNI.

## Claude Vision Implementation (`lib/extraction/claude.ts`)

Implements `ExtractionProvider` using the `@anthropic-ai/sdk`.

### Flow

1. Accept `fileBuffer` and `mimeType`
2. Base64-encode the buffer
3. Build the message with the FND-11 extraction prompt (copied from `scripts/sandbox/test-extraction.ts`)
4. Call Claude API with:
   - Model: `claude-sonnet-4-20250514`
   - Max tokens: 2048
   - 60-second timeout
   - Document type content block (base64 source) for PDFs
   - Image type content block for JPEG/PNG
5. Parse JSON response from the text content block
6. Map snake_case AI response fields to camelCase `ExtractedInvoice` type (notably: `confidence` → `confidenceScore`, `unit_price` → `unitPrice`, `vendor_name` → `vendorName`, etc.)
7. Return `ExtractionResult` with raw response, model version, and timing

### Content block types

- PDF files: `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`
- JPEG/PNG files: `{ type: "image", source: { type: "base64", media_type: "image/jpeg" | "image/png", data } }`

### Error handling

| Error | Detection | Action |
|-------|-----------|--------|
| Timeout (>60s) | Anthropic SDK timeout config | Throw with message "Extraction timed out. Please retry." |
| Rate limit (429) | SDK throws `RateLimitError` | Retry with exponential backoff (1s, 2s, 4s). Max 3 retries. If all retries exhausted, throw with message "Extraction service is busy. Please retry in a moment." |
| Malformed JSON | `JSON.parse` fails | Throw with message "Could not parse extraction results." Include raw text in error details. |
| Refusal / empty | No text content block or empty text | Throw with message "Could not extract data from this document." |
| API error (5xx) | SDK throws `APIError` | Throw with message "Extraction service unavailable. Please retry." |

All errors thrown by the provider are caught by the orchestration layer (`run.ts`), which sets invoice status to `error`.

### JSON parsing resilience

The prompt asks for raw JSON, but Claude may occasionally wrap in code fences. Strip ```` ```json ``` ```` wrappers before parsing, matching the pattern from the FND-11 test script.

## Orchestration (`lib/extraction/run.ts`)

```typescript
export async function runExtraction(params: {
  invoiceId: string;
  orgId: string;
  userId: string;
  filePath: string;
  fileType: string;
}): Promise<ExtractionResult>
```

This is the shared function called by both the upload auto-trigger and the extract API route.

### Flow

1. **Generate signed URL** — Create a fresh 1-hour signed URL from Supabase Storage
2. **Fetch file** — Download the file bytes from the signed URL
3. **Call provider** — `getExtractionProvider().extractInvoiceData(buffer, mimeType)`
4. **Store results** — Insert into `extracted_data` table (mapping camelCase → snake_case, including `extraction_duration_ms` and `model_version`), then insert each line item into `extracted_line_items` (with `gl_account_id` set to `null` — populated later during review)
5. **Update status** — Set invoice status to `pending_review`
6. **Log** — Structured log with action, invoiceId, orgId, userId, durationMs, modelVersion, confidenceScore

### Error handling

If any step fails:
1. Set invoice status to `error` with `error_message` from the caught error
2. Increment `retry_count`
3. Log the error with full context
4. Re-throw the error (caller decides whether to surface it or swallow it)

### Database writes

Uses the admin client (service role) to bypass RLS for writes. The ownership check happens before `runExtraction` is called — either in the upload route (implicit, since the user just created the invoice) or in the extract API route (explicit ownership query).

## Extract API Route (`app/api/invoices/[id]/extract/route.ts`)

`POST /api/invoices/[id]/extract`

Used for manual retries when extraction failed or the user wants to re-extract.

### Flow

1. **Auth** — Get user from Supabase auth session
2. **Ownership check** — Query invoice by ID, join through `org_memberships` to verify user has access
3. **Status guard** — If invoice status is `extracting`, return 409 Conflict. If `synced`, return 409 ("Already synced, cannot re-extract.")
4. **Set status** — Update invoice to `extracting`
5. **Run extraction** — Call `runExtraction()` with invoice details
6. **Return** — Return the `ExtractionResult.data` via `apiSuccess()`

### Error responses

| Case | Status | Code |
|------|--------|------|
| Not authenticated | 401 | AUTH_ERROR |
| Invoice not found / not owned | 404 | NOT_FOUND |
| Already extracting | 409 | CONFLICT |
| Already synced | 409 | CONFLICT |
| Extraction failure | 500 | INTERNAL_ERROR (with specific message) |

## Upload Route Modification (`app/api/invoices/upload/route.ts`)

After the current step 8 (generate signed URL), add:

```
// 9. Auto-trigger extraction (fire-and-forget style within the request)
try {
  await runExtraction({ invoiceId, orgId, userId, filePath: storagePath, fileType });
} catch {
  // Extraction failure is non-fatal for the upload response.
  // Invoice status is already set to 'error' by runExtraction.
  // User can retry via the extract endpoint.
}
```

The upload route still returns `apiSuccess` with the invoiceId regardless of extraction outcome. The frontend will poll or read the invoice status to know when extraction is complete.

**Important:** This makes the upload request synchronous through extraction (~4-5 seconds total). Per CLAUDE.md, this is acceptable for MVP (<10 users) with a loading spinner. The upload response is delayed but includes the extraction result, so the frontend can navigate directly to the review UI.

### Updated return shape (breaking change from current upload response)

```typescript
{
  data: {
    invoiceId: string;
    fileName: string;
    signedUrl: string | null;
    extractionStatus: "pending_review" | "error";
    extractedData: ExtractedInvoice | null;
  }
}
```

No frontend currently consumes the upload response (UI is built in a later issue), so this breaking change has no impact.

## Tests

| Test file | What it covers |
|-----------|---------------|
| `lib/extraction/claude.test.ts` | Claude provider: happy path, JSON parsing, code fence stripping, error cases (timeout, rate limit with retries, malformed, refusal) |
| `lib/extraction/run.test.ts` | Orchestration: DB writes, status transitions, error handling, signed URL generation |
| `app/api/invoices/[id]/extract/route.test.ts` | API route: auth, ownership, status guard (409), success, failure |
| `app/api/invoices/upload/route.test.ts` | Update existing tests: add cases for successful extraction auto-trigger, failed extraction (non-fatal), updated response shape |

All external calls (Anthropic SDK, Supabase) mocked via MSW or vi.mock.

## Extraction Prompt

Copied verbatim from the validated FND-11 prompt in `scripts/sandbox/test-extraction.ts` (lines 94-127). No modifications — it achieved 100% accuracy on synthetic invoices.

## Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `@anthropic-ai/sdk` | `^0.39` (latest) | Official Anthropic SDK for Claude API calls |
