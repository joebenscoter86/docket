# DOC-53: Xero Sandbox Validation — Design Spec

## Purpose

Validate Xero's API behavior empirically before building the real integration. Mirrors FND-9 (QBO sandbox validation) which caught several surprises that would have been production bugs. The documented findings become the reference for all subsequent Xero issues (DOC-54 through DOC-61).

## Approach: Split Auth + Validation Scripts

Xero uses OAuth2 with PKCE (Proof Key for Code Exchange) — a more secure auth flow than QBO's standard OAuth. This means the auth step is slightly more involved, so we split it into two scripts:

1. **`scripts/sandbox/xero-auth.ts`** — One-time auth helper
2. **`scripts/sandbox/test-xero.ts`** — API validation (reads saved tokens)

### Why split?

- Auth only needs to run once (refresh token lasts 60 days)
- API tests can be iterated on without re-authenticating each time
- The PKCE flow itself is something we need to validate (it's new territory vs QBO)

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `scripts/sandbox/xero-auth.ts` | New | OAuth2 PKCE helper — opens browser, catches callback, saves tokens |
| `scripts/sandbox/test-xero.ts` | New | API validation — 5 test sections matching QBO script structure |
| `scripts/sandbox/sandbox-notes.md` | Append | Full Xero findings section matching QBO format |
| `.env.example` | Append | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_TENANT_ID` with comments |

## Script 1: `xero-auth.ts`

### What it does

1. Generates a PKCE code verifier + code challenge (RFC 7636)
2. Spins up a temporary local HTTP server on port 3000
3. Opens the browser to Xero's authorization URL with:
   - `response_type=code`
   - `code_challenge` + `code_challenge_method=S256`
   - `scope=openid profile email accounting.transactions accounting.contacts accounting.settings`
   - `redirect_uri=http://localhost:3000/api/auth/callback/xero`
4. User clicks "Allow" in the browser (one-time manual step)
5. Catches the callback, extracts the authorization code
6. Exchanges the code + PKCE verifier for tokens via `POST https://identity.xero.com/connect/token`
7. Fetches the tenant ID via `GET https://api.xero.com/connections`
8. Prints tokens and tenant ID to console for manual copy to `.env.local`
9. Shuts down the temporary server

### Env vars needed

```
XERO_CLIENT_ID=        # From Xero Developer Portal
XERO_CLIENT_SECRET=    # From Xero Developer Portal
```

### Usage

```bash
npx tsx scripts/sandbox/xero-auth.ts
```

### Validation targets

- Confirm PKCE flow works end-to-end
- Confirm token response shape (access_token, refresh_token, expires_in, token_type, scope)
- Confirm tenant ID retrieval via `/connections` endpoint
- Document actual token lifetimes (docs say 30 min access, 60 day refresh — confirm empirically)

## Script 2: `test-xero.ts`

### What it does

Reads tokens from `.env.local` and runs 5 test sections, matching the QBO script structure exactly:

### Section 1: Query Contacts (Xero's vendors)

- `GET https://api.xero.com/api.xro/2.0/Contacts`
- Xero header required: `xero-tenant-id: {tenantId}`
- Document: field names, ID format (UUID vs numeric string), which field maps to "vendor display name"
- Key question to answer: ContactID format, CompanyName vs Name field reliability

### Section 2: Query Accounts (chart of accounts)

- `GET https://api.xero.com/api.xro/2.0/Accounts`
- Filter for expense-type accounts (Xero uses `Type` and `Class` fields)
- Document: field names, how account hierarchy works, what maps to QBO's `FullyQualifiedName`
- Key question to answer: how to filter expense accounts for GL coding dropdowns

### Section 3: Create a Bill

- `PUT https://api.xero.com/api.xro/2.0/Invoices` with `Type: "ACCPAY"`
- Note: Xero uses PUT (not POST) for creating invoices
- Note: "Bills" in Xero are invoices with `Type: ACCPAY` (Accounts Payable)
- Payload includes: Contact reference, LineItems with AccountCode, Date, DueDate
- Document: minimum required payload, response enrichment (what Xero adds), status codes
- Key question to answer: does Xero return 200 or 201? What ID format? What's the equivalent of QBO's SyncToken?

### Section 4: Attach PDF to Bill

- `POST https://api.xero.com/api.xro/2.0/Invoices/{InvoiceID}/Attachments/{FileName}`
- Body is raw file bytes, Content-Type is the file's MIME type
- Note: simpler than QBO's multipart approach — just send the binary directly
- Document: response shape, file size limits, supported types

### Section 5: Error Cases

- **5a: Bad/expired token** — send request with `Authorization: Bearer bad_token`
  - Document: HTTP status, response shape, header values
- **5b: Missing required fields** — create invoice without Contact
  - Document: validation error shape, field-level error messages
- **5c: Invalid ContactID** — create invoice with nonexistent contact
  - Document: how Xero reports reference errors vs QBO's approach
- **5d: Duplicate invoice number** (if applicable)
  - Document: how Xero handles idempotency

### Env vars needed

```
XERO_ACCESS_TOKEN=     # From xero-auth.ts output
XERO_TENANT_ID=        # From xero-auth.ts output
```

### Usage

```bash
npx tsx scripts/sandbox/test-xero.ts
```

## Documentation Output: sandbox-notes.md

Append a new section to `scripts/sandbox/sandbox-notes.md` with this structure (matching QBO format):

```
## Xero Sandbox (DOC-53) — 2026-03-XX

### Setup
- Developer portal URL
- App type, scopes, redirect URIs
- Demo company info

### Auth (OAuth2 + PKCE)
- Token endpoint URLs
- Token lifetimes (confirmed empirically)
- PKCE details (code_challenge_method, verifier length)
- Refresh behavior
- Tenant ID retrieval

### Contact (Vendor) Response Shape
- Key fields, ID format, naming conventions

### Account Response Shape
- Key fields, expense filtering, hierarchy

### Bill (Invoice ACCPAY) Creation
- Endpoint, method (PUT vs POST)
- Minimum payload, optional fields
- Response enrichment
- Status codes

### PDF Attachment
- Endpoint, method
- Request format (raw binary vs multipart)
- Response shape

### Error Response Shapes
- Auth errors vs validation errors
- Consistency comparison with QBO

### Rate Limits
- Documented limits
- Observed behavior

### Surprises / Gotchas
- Numbered list of everything unexpected
- Direct comparison with QBO equivalents where relevant
```

## .env.example Updates

Append to the existing file:

```
# Xero
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
# Xero tenant ID (retrieved via /connections endpoint after OAuth)
# Each Xero organization has a unique tenant ID (UUID format)
XERO_TENANT_ID=
```

## What This Does NOT Include

- No production code changes — these are throwaway scripts
- No changes to `lib/accounting/` — that's DOC-54+
- No Xero adapter implementation — that comes after we know how the API actually behaves
- No changes to the database schema

## Success Criteria

1. `xero-auth.ts` completes the full PKCE OAuth flow and outputs valid tokens
2. `test-xero.ts` successfully: queries contacts, queries accounts, creates a test bill, attaches a PDF
3. All response shapes documented in sandbox-notes.md
4. Error response shapes documented with comparison to QBO patterns
5. Token lifetimes confirmed empirically (not just from docs)
6. At least 5 "Surprises / Gotchas" documented (there are always surprises)
7. `.env.example` updated with Xero vars

## Dependencies

- Joe's existing Xero developer account and app (confirmed available)
- Xero demo company (free, auto-provisioned with developer account)
- No dependency on other issues — can run in parallel with XRO-1

## Downstream Impact

- DOC-54 (Xero OAuth connect flow) directly uses the auth findings
- DOC-55+ (Xero adapter) uses the API response shapes to build the `XeroAccountingAdapter`
- DOC-61 (E2E test) validates the full flow against these documented patterns
