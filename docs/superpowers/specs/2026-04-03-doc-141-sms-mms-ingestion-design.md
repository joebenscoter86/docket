# DOC-141: SMS/MMS Invoice Ingestion via Twilio

**Date:** 2026-04-03
**Status:** Approved
**Linear:** DOC-141

## Overview

Users text photos of invoices/receipts to a Docket toll-free number. The system identifies the sender by their registered phone number, stores the image, and runs AI extraction. Same pipeline as email forwarding (DOC-62), with Twilio-specific differences.

**Toll-free number:** +1 (855) 507-3460

## Architecture

```
User sends MMS -> Twilio webhook -> POST /api/sms/inbound ->
  validate Twilio signature -> identify user by phone -> fetch media ->
  HEIC->JPEG if needed -> validate magic bytes + size ->
  store in Supabase Storage -> create invoice record (source: 'sms') ->
  trigger async extraction via waitUntil
```

## 1. Webhook Handler: `POST /api/sms/inbound`

Mirrors `app/api/email/inbound/route.ts`:

1. **Validate Twilio signature** using `twilio.validateRequest()` with auth token + request URL. Reject invalid with 401.
2. **Parse form body** -- Twilio sends `application/x-www-form-urlencoded`:
   - `From`: sender phone (E.164)
   - `Body`: text content
   - `NumMedia`: attachment count
   - `MediaUrl0..N`: URLs to media (hosted by Twilio ~24hrs)
   - `MediaContentType0..N`: MIME types
3. **Look up user** by `From` against `users.phone_number` -> resolve org via `org_memberships`.
   - No match: reply directing to `dockett.app/settings`
   - Match but no media: reply asking for a photo
4. **Rate limit** -- 10 MMS/hour per phone number (DB-backed via `sms_ingestion_log`)
5. **Billing/usage check** -- reuse `checkInvoiceAccess` + `checkUsageLimit`
6. **For each media attachment (up to 5):**
   - Fetch binary from Twilio MediaUrl (basic auth with Account SID + Auth Token)
   - Detect MIME type via magic bytes
   - HEIC: convert to JPEG via `sharp` at quality 95
   - Validate type (JPEG, PNG, PDF) and size (<10MB)
   - Store at `{orgId}/{invoiceId}/{filename}` in Supabase Storage
   - Create invoice record with `source: 'sms'`, store body text as `sms_body_context`
   - Enqueue extraction via `waitUntil` (awaited, not fire-and-forget)
7. **Reply via TwiML XML** -- always return 200 with `<Response><Message>`
8. **Structured logging** on every path

## 2. Database Changes

### `users` table
```sql
ALTER TABLE users ADD COLUMN phone_number TEXT UNIQUE;
CREATE INDEX idx_users_phone_number ON users(phone_number);
```

### `invoices` table
- Add `'sms'` to source type: `"upload" | "email" | "sms" | "api"`
- Add `sms_body_context TEXT` (nullable) -- text sent with the photo, passed to Claude as supplementary context

### New table: `sms_verification_codes`
```sql
CREATE TABLE sms_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sms_verification_user ON sms_verification_codes(user_id);
```
- 6-digit code, 5-minute TTL
- Cleaned up after successful verification
- Rate limit: max 3 verification attempts per phone number per hour

### New table: `sms_ingestion_log`
```sql
CREATE TABLE sms_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  from_number TEXT NOT NULL,
  num_media INTEGER DEFAULT 0,
  body_text TEXT,
  total_attachment_count INTEGER DEFAULT 0,
  valid_attachment_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected', 'rate_limited', 'duplicate')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sms_ingestion_log_org ON sms_ingestion_log(org_id);
CREATE INDEX idx_sms_ingestion_log_from ON sms_ingestion_log(from_number);
```

## 3. Settings UI: SMS Ingestion Card

Component: `components/settings/SmsIngestionCard.tsx`

Same pattern as `EmailIngestionCard`. Three states:

### Not registered
- Card description + "Add Phone Number" button
- Clicking reveals phone number input (US format)
- Submit sends 6-digit verification code via SMS

### Verification pending
- 6-digit code input + "Verify" button
- "Didn't receive it? Resend" link (respects rate limit)
- Cancel to go back

### Verified
- Shows registered phone number
- Shows the Docket toll-free number to text with copy button
- "Send a test MMS" link (opens native SMS app)
- "Remove Phone Number" with confirmation dialog

### API Routes
- `POST /api/sms/verify/send` -- sends verification code
- `POST /api/sms/verify/confirm` -- validates code, saves phone to user record
- `DELETE /api/sms/phone` -- removes phone number

## 4. HEIC Handling

At ingest time, before storage:
```typescript
sharp(buffer).jpeg({ quality: 95 }).toBuffer()
```

High quality to preserve detail on blurry receipts. Stored as JPEG. The existing `ensureMinimumResolution` pipeline (1500px min short side, lanczos3) handles upscaling during extraction.

## 5. Invoice List

Add SMS source indicator: phone icon + sender context, alongside existing email envelope icon.

## 6. Reply Messages

All under 160 chars (single SMS segment):

| Scenario | Reply |
|----------|-------|
| Success (1 file) | `Got it! Processing 1 invoice. Review at dockett.app/invoices` |
| Success (N files) | `Got it! Processing N invoices. Review at dockett.app/invoices` |
| Unregistered number | `This number isn't registered with Dockett. Add your phone at dockett.app/settings` |
| No attachment | `Attach a photo of an invoice or receipt to process it.` |
| Unsupported format | `Unsupported file type. Send a photo (JPEG, PNG, HEIC) or PDF.` |
| Rate limited | `Too many messages. Try again in a few minutes.` |
| Billing blocked | `Your Dockett subscription is inactive. Visit dockett.app/settings` |
| Usage limit | `Monthly invoice limit reached. Upgrade at dockett.app/settings` |

STOP/opt-out handled automatically by Twilio.

## 7. Out of Scope

- Multi-org routing (one phone = one default org)
- MMS replies (no sending images back)
- Conversation threading
- HELP/INFO keyword handling beyond Twilio built-in STOP
- Phone number changes (remove + re-add)

## 8. Dependencies

- `twilio` npm package (new) -- for signature validation and sending verification SMS
- `sharp` (already in deps) -- for HEIC conversion
- Reuses: `enqueueExtraction`, `checkInvoiceAccess`, `checkUsageLimit`, `waitUntil` pattern from DOC-62

## 9. Environment Variables

```
TWILIO_ACCOUNT_SID=<from Twilio console>
TWILIO_AUTH_TOKEN=<from Twilio console>
TWILIO_PHONE_NUMBER=+18555073460
```
