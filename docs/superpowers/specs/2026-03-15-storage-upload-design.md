# DOC-13: Supabase Storage Upload — Design Spec

## Goal

Build the server-side upload pipeline that receives files from the UploadZone UI, stores them in Supabase Storage, creates invoice database records, and returns signed URLs for viewing.

## Architecture

Single API route (`POST /api/invoices/upload`) handles the full flow: auth check, org lookup, server-side file validation (magic bytes + size), Supabase Storage upload, invoice row creation, signed URL generation. The admin client (service role) is used for storage operations to bypass bucket-level RLS. The server client (cookie-aware) is used for auth and org lookup.

## Data Flow

1. UploadZone sends `multipart/form-data` with single `file` field
2. API route authenticates user via Supabase session cookies
3. Queries `org_memberships` for user's `org_id` — 403 if none found
4. Validates file server-side:
   - Size <= 10MB
   - Magic bytes match expected MIME type (PDF: `%PDF`, JPEG: `FF D8 FF`, PNG: `89 50 4E 47`)
5. Generates invoice UUID upfront
6. Uploads to Supabase Storage: `{org_id}/{invoice_id}/{original_filename}`
7. Inserts invoice row with status `uploading`
8. Updates status to `extracting` (handoff signal for DOC-14)
9. Generates 1-hour signed URL
10. Returns `{ data: { invoiceId, fileName, signedUrl } }`

## Files

| File | Purpose |
|------|---------|
| `lib/upload/validate.ts` | Magic byte validation + MIME type mapping |
| `lib/upload/validate.test.ts` | Tests for magic byte validation |
| `app/api/invoices/upload/route.ts` | API route implementation |
| `app/api/invoices/upload/route.test.ts` | API route tests |
| `components/invoices/UploadZone.tsx` | Wire up to real API (replace mock upload) |
| `components/invoices/UploadZone.test.tsx` | Update tests for real API integration |

## Error Handling

| Scenario | Response |
|----------|----------|
| No auth session | 401 AUTH_ERROR |
| No org membership | 403 AUTH_ERROR "No organization found. Please contact support." |
| File too large | 400 VALIDATION_ERROR "File exceeds 10MB limit." |
| Invalid magic bytes | 400 VALIDATION_ERROR "File content does not match expected type." |
| No file in request | 400 VALIDATION_ERROR "No file provided." |
| Storage upload failure | 500 INTERNAL_ERROR (logged with details) |
| DB insert failure | 500 INTERNAL_ERROR (logged with details) |

## Implementation Notes

- The no-org case uses a new `forbiddenError` helper (403) rather than `authError` (401), since the user IS authenticated — they just lack an org.
- If storage upload succeeds but DB insert fails, the file is orphaned in storage. Acceptable at MVP volumes; cleanup deferred.
- Filename is used as-is in the storage path. Supabase Storage handles special characters. Path traversal is mitigated by the `{org_id}/{invoice_id}/` prefix structure.

## Not In Scope

- Extraction trigger (DOC-14)
- Rate limiting (deferred — Vercel built-in when needed)
- Post-upload redirect/navigation
- Bucket creation (assumed to exist from FND-2)
