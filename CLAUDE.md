# CLAUDE.md - Docket

> Auto-loaded by Claude Code at session start. Read this before touching any file.

## What We're Building

A web app where small businesses upload invoices (PDF, image, or email), AI extracts the structured data, the user reviews it in a clean side-by-side UI, and one click pushes it into QuickBooks Online as a bill. The system learns from corrections to improve accuracy over time.

**MVP scope (what ships first):**
- PDF upload (single file, drag and drop)
- AI extraction via Claude Vision API
- Side-by-side review/correction UI
- QuickBooks Online integration (create bill + attach PDF)
- Email/password auth (Supabase Auth)
- Stripe subscription billing ($99/mo Growth plan)

**NOT in MVP:**
- Xero integration (Phase 2)
- Email forwarding ingestion (Phase 2)
- Batch upload (Phase 2)
- Vendor auto-matching / GL auto-coding (Phase 3)
- Team/multi-user accounts (Phase 3)
- Dashboard/analytics (Phase 3)
- API access (Phase 4)

**Launch model:** First 10 customers get permanent free access to all MVP features, capped at 100 invoices/month. They are design partners, not revenue. Phase 2+ features get paywalled for these users. General availability after that: 14-day free trial, then paid tiers.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS (no component libraries) |
| Hosting | Vercel |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) |
| File Storage | Supabase Storage |
| AI Extraction | Claude Vision API (primary) |
| Accounting Integration | QuickBooks Online REST API (OAuth2) |
| Billing | Stripe Subscriptions + Customer Portal |
| Transactional Email | Resend |
| Error Monitoring | Sentry |
| Analytics | Plausible or PostHog (TBD during BIL-9) |

---

## Repository

- **GitHub URL:** TBD (create during FND-1)
- **Local path:** TBD
- **Branch strategy:**

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | Always deployable | Protected. PRs only. No direct commits. |
| `dev` | Integration branch | PRs from feature branches merge here. |
| `feature/[PREFIX]-X-[description]` | One branch per Linear issue | Branch from `dev`, PR back to `dev` |
| `fix/[PREFIX]-X-[description]` | Bug fixes | Same pattern as feature |

- **Commit format (conventional commits):**
```
feat: description (PREFIX-X)
fix: description (PREFIX-X)
chore: description (PREFIX-X)
docs: description (PREFIX-X)
```

- **PR rules:**
  - Always create a PR with `gh pr create` after pushing a branch
  - PR title must include the Linear issue key (e.g., `DOC-5`) so Linear auto-links
  - Do NOT merge unless Joe gives explicit approval in the current session
  - Default: your job ends when the PR is open and the status report is delivered
  - Merge with `gh pr merge --squash --delete-branch` only on Joe's green light

---

## Architecture Rules (Non-Negotiable)

1. **Processing pipeline runs on Vercel API routes, not Supabase Edge Functions.** Keeps everything in one deployment, one set of logs, one place to debug. If batch processing is needed later, add a queue without rearchitecting.

2. **AI provider is swappable.** Build the extraction interface so swapping Claude Vision for Google Document AI (or any future provider) is a config change, not a rewrite. Abstract behind an `extractInvoiceData(fileUrl): ExtractedInvoice` interface.

3. **OAuth tokens are always encrypted at rest.** Access tokens and refresh tokens in `accounting_connections` must be encrypted before storage. Never log tokens, never expose them in client bundles.

4. **Server-side secrets never reach the client.** All API keys (Claude, Stripe, QBO) live in server-side API routes only. No `NEXT_PUBLIC_` prefix on secrets.

5. **Every user-facing error must surface.** Never silently swallow failures. Failed extractions, failed syncs, expired connections: all must show clear, actionable messages in the UI.

6. **RLS on every table.** Row Level Security policies must be active on all Supabase tables. Users can only access data belonging to their organization.

7. **No component libraries.** No shadcn, no MUI, no Chakra. Build from scratch with Tailwind CSS. Keep the bundle lean and the design consistent.

8. **Structured logging on every API route.** Every API route must log a structured JSON object at entry and exit: `{ action, invoiceId?, orgId, userId, durationMs, status, error? }`. Use a thin `lib/utils/logger.ts` wrapper. No `console.log` in production — use the logger.

9. **OAuth flows must include CSRF protection.** All OAuth2 flows (QBO, future Xero) must generate and validate a `state` parameter. Reject callbacks with missing or mismatched state.

10. **API routes must verify resource ownership before side effects.** RLS protects database reads, but API routes that call external APIs (QBO sync, Claude extraction) or access Supabase Storage must explicitly verify the user owns the resource *before* performing the operation. Never rely solely on "RLS will return empty results" for authorization.

11. **File uploads validated server-side by magic bytes.** Never trust file extensions alone. Validate the first bytes of uploaded files match expected MIME types (PDF: `%PDF`, JPEG: `FF D8 FF`, PNG: `89 50 4E 47`). Reject mismatches with a clear error.

12. **Rate limiting on upload and extraction endpoints.** Use Vercel's built-in rate limiting (via `vercel.json` or middleware) on `POST /api/invoices/upload` and `POST /api/invoices/[id]/extract`. MVP limits: 20 uploads/minute/user, 10 extractions/minute/user.

13. **Token encryption uses AES-256-GCM.** `lib/utils/encryption.ts` must use AES-256-GCM with a random 12-byte IV per encryption. The IV is prepended to the ciphertext and stored together. `ENCRYPTION_KEY` must be exactly 32 bytes (256 bits), hex-encoded in `.env`. Key rotation deferred to Phase 2.

---

## Folder Structure

```
docket/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── invoices/
│   │   │   ├── page.tsx                    # Invoice list view
│   │   │   └── [id]/
│   │   │       └── review/page.tsx         # Side-by-side review UI
│   │   ├── upload/page.tsx                 # Invoice upload interface
│   │   ├── settings/page.tsx               # Account, QBO connection, billing
│   │   └── layout.tsx                      # App shell (sidebar, header)
│   ├── api/
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── quickbooks/route.ts     # QBO OAuth2 callback
│   │   ├── invoices/
│   │   │   ├── upload/route.ts             # Handle file upload
│   │   │   ├── [id]/
│   │   │   │   ├── extract/route.ts        # Trigger AI extraction
│   │   │   │   ├── approve/route.ts        # Mark as approved
│   │   │   │   ├── sync/route.ts           # Push to QBO
│   │   │   │   └── retry/route.ts          # Re-trigger extraction
│   │   │   └── route.ts                    # List invoices
│   │   ├── quickbooks/
│   │   │   ├── connect/route.ts            # Initiate OAuth2 flow
│   │   │   ├── vendors/route.ts            # Fetch vendor list
│   │   │   └── accounts/route.ts           # Fetch chart of accounts
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts           # Create checkout session
│   │   │   └── webhook/route.ts            # Handle subscription events
│   │   └── health/route.ts
│   ├── layout.tsx                          # Root layout
│   └── page.tsx                            # Landing page
├── components/
│   ├── invoices/
│   │   ├── UploadZone.tsx                  # Drag-and-drop upload
│   │   ├── InvoiceList.tsx                 # Table with filters
│   │   ├── InvoiceStatusBadge.tsx          # Status indicator
│   │   ├── PdfViewer.tsx                   # PDF renderer
│   │   ├── ExtractionForm.tsx              # Editable extracted fields
│   │   └── LineItemEditor.tsx              # Add/remove/edit line items
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── AppShell.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       └── Badge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser client
│   │   ├── server.ts                       # Server client
│   │   └── admin.ts                        # Service role client
│   ├── extraction/
│   │   ├── provider.ts                     # Provider-agnostic interface
│   │   ├── claude.ts                       # Claude Vision implementation
│   │   ├── run.ts                          # Extraction orchestration (shared)
│   │   └── types.ts                        # ExtractedInvoice type
│   ├── quickbooks/
│   │   ├── auth.ts                         # OAuth2 helpers (token refresh, etc.)
│   │   ├── api.ts                          # QBO API wrapper
│   │   └── types.ts                        # QBO-specific types
│   ├── stripe/
│   │   ├── client.ts                       # Stripe SDK init
│   │   └── helpers.ts                      # Subscription checks, portal URL
│   └── utils/
│       ├── encryption.ts                   # AES-256-GCM token encryption/decryption
│       ├── errors.ts                       # Standardized error responses
│       └── logger.ts                       # Structured JSON logging wrapper
├── supabase/
│   ├── migrations/                         # SQL migration files
│   └── seed.sql                            # Test data (dev only)
├── scripts/
│   └── sandbox/                            # Throwaway API validation scripts
│       ├── test-qbo.ts
│       ├── test-xero.ts
│       ├── test-extraction.ts
│       └── sandbox-notes.md
├── public/
├── .env.local                              # Local secrets (git-ignored)
├── .env.example                            # Template for required env vars
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── CLAUDE.md                               # This file (copy from docketclaude.md)
```

---

## Key Data Flows

### Happy Path: Invoice Upload to QBO Sync

1. **Upload:** User drops PDF into UploadZone. Client calls `POST /api/invoices/upload`. File goes to Supabase Storage. Metadata row created in `invoices` table with status `uploading` → `extracting`.
2. **Extract:** API route sends document image to Claude Vision API via `lib/extraction/provider.ts`. AI returns structured JSON. Response parsed and stored in `extracted_data` + `extracted_line_items` tables. Invoice status → `pending_review`.
3. **Review:** Frontend shows side-by-side: PdfViewer (left) + ExtractionForm (right). User reviews, corrects fields, maps vendor and GL accounts from QBO dropdowns. Corrections stored in `corrections` table.
4. **Approve:** User clicks Approve. `POST /api/invoices/[id]/approve`. Invoice status → `approved`.
5. **Sync:** User clicks "Sync to QuickBooks". `POST /api/invoices/[id]/sync`. **Idempotency guard:** check `sync_log` for existing successful sync before calling QBO — if found, return existing result (prevents duplicate bills on double-click or timeout-retry). API route calls QBO Bill creation endpoint, then attaches the source PDF via the Attachable endpoint. Response logged in `sync_log`. Invoice status → `synced`.

**Extraction UX:** For MVP, extraction is synchronous — user sees a loading state ("Extracting invoice data...") while the API route calls Claude. Typical time: 5-15 seconds. Timeout at 60 seconds. No polling or websockets needed at MVP scale (<10 users). If extraction becomes a bottleneck in Phase 2+, move to async with polling.

### Error Handling at Each Step

| Step | Failure Mode | Handling |
|------|-------------|----------|
| Upload | Large file (>10MB) | Client-side validation before upload. Show "File exceeds 10MB limit." |
| Upload | Wrong format | Client-side validation. PDF, JPG, PNG only. Show "Unsupported file type." |
| Upload | Server-side type check | Validate file magic bytes on server, not just extension. Reject mismatches. |
| Upload | Supabase Storage failure | Set status `error`. Show "Upload failed. Please try again." Log full error to Sentry. |
| Extract | Claude API timeout (>60s) | Set status `error`. Show "Extraction timed out. Please retry." |
| Extract | Malformed AI response | Set status `error`. Store raw response in `raw_ai_response` for debugging. |
| Extract | Claude returns refusal | Set status `error`. Show "Could not extract data from this document. The file may be unreadable or unsupported." |
| Extract | Claude returns empty response | Set status `error`. Show "No data could be extracted. Please check the file quality and retry." |
| Extract | File URL expired | Generate fresh signed URL before calling Claude. If Storage returns 404, set status `error`. |
| Extract | Partial extraction | Save what we got. Status `pending_review` with `confidence_score = 'low'`. |
| Extract | Rate limit (429) | Queue retry with exponential backoff (1s, 2s, 4s). Max 3 retries. |
| Extract | Already extracting (duplicate trigger) | Check invoice status before starting. If `extracting`, return 409 Conflict. |
| Review | New vendor (not in QBO) | Show inline prompt: "This vendor doesn't exist in QuickBooks. Create it there first, then refresh." |
| Approve | Missing required fields | Block approval if `vendor_name` or `total_amount` is empty. Show which fields need attention. |
| Sync | No QBO connection | Check for active `accounting_connections` before sync. Show "Connect QuickBooks in Settings first." |
| Sync | OAuth token expired | Auto-refresh. If refresh fails, prompt reconnection in Settings. |
| Sync | QBO API error (400/500) | Log full request + response. Show "Sync failed: [reason]. Please retry." |
| Sync | QBO rate limit (500/hr) | Queue and retry. Not a real concern for MVP volumes. |
| Sync | Duplicate submission | Idempotency guard: check `sync_log` for existing success. Return existing `provider_bill_id`. |
| Sync | VendorRef not found in QBO | Show "Vendor '[name]' not found in QuickBooks. Please map to an existing vendor or create one in QBO." |
| Sync | Bill created, PDF attachment fails | Log partial success. Set status `synced` with warning. Show "Bill created but PDF attachment failed. You can attach it manually in QuickBooks." |
| OAuth | User denies QBO permissions | Redirect to Settings with message "QuickBooks connection was not authorized." |
| OAuth | Missing `state` parameter (CSRF) | Reject callback. Log security warning. Show "Connection failed. Please try again." |
| Stripe | Invalid webhook signature | Return 400. Log to Sentry. No user impact. |
| Stripe | DB update fails on webhook | Return 500 (Stripe will retry). Log to Sentry. User sees stale subscription status until retry succeeds. |

---

## Database Schema

```sql
-- Core tables

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  is_design_partner BOOLEAN DEFAULT false,    -- first 10 users bypass billing
  onboarding_completed BOOLEAN DEFAULT false  -- tracks onboarding flow completion
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE accounting_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero')),
  access_token TEXT NOT NULL,    -- encrypted with AES-256-GCM
  refresh_token TEXT NOT NULL,   -- encrypted with AES-256-GCM
  token_expires_at TIMESTAMPTZ NOT NULL,
  company_id TEXT NOT NULL,      -- provider's company/tenant ID
  connected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'extracting', 'pending_review', 'approved', 'synced', 'error')),
  file_path TEXT NOT NULL,       -- Supabase Storage reference
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,       -- MIME type (application/pdf, image/jpeg, image/png)
  file_size_bytes INTEGER NOT NULL, -- for diagnostics and upload limit enforcement
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE extracted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL UNIQUE,
  vendor_name TEXT,
  vendor_address TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  subtotal NUMERIC(12,2),
  tax_amount NUMERIC(12,2),
  total_amount NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  payment_terms TEXT,
  raw_ai_response JSONB,        -- full AI output for debugging
  confidence_score TEXT CHECK (confidence_score IN ('high', 'medium', 'low')),
  model_version TEXT,            -- AI model version used (e.g., 'claude-sonnet-4-6')
  extraction_duration_ms INTEGER, -- wall-clock time for extraction API call
  extracted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE extracted_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_data_id UUID REFERENCES extracted_data(id) NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2),
  unit_price NUMERIC(12,2),
  amount NUMERIC(12,2),
  gl_account_id TEXT,            -- user-selected or auto-mapped QBO account ref
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  org_id UUID REFERENCES organizations(id) NOT NULL, -- for RLS consistency + future per-org ML training
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  corrected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  provider TEXT NOT NULL,
  provider_bill_id TEXT,
  request_payload JSONB,         -- what we sent to the provider (for debugging failed syncs)
  provider_response JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'retrying'))
);

-- Indexes (beyond primary keys)
CREATE INDEX idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships(org_id);
CREATE INDEX idx_invoices_org_id ON invoices(org_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_org_status ON invoices(org_id, status);
CREATE INDEX idx_extracted_data_invoice_id ON extracted_data(invoice_id);
CREATE INDEX idx_extracted_line_items_data_id ON extracted_line_items(extracted_data_id);
CREATE INDEX idx_corrections_invoice_id ON corrections(invoice_id);
CREATE INDEX idx_corrections_org_id ON corrections(org_id);
CREATE INDEX idx_sync_log_invoice_id ON sync_log(invoice_id);
CREATE INDEX idx_accounting_connections_org_id ON accounting_connections(org_id);

-- Phase 3 (not in MVP)
-- CREATE TABLE vendor_mappings (...)
```

**RLS policy pattern (apply to every table with `org_id`):**
```sql
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

-- Uses org_memberships join — works for all org members, not just owner.
-- Trivially supports Phase 3 team accounts without rewriting policies.
CREATE POLICY "[table]_org_access" ON [table]
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
```

**RLS for `org_memberships` itself:**
```sql
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_memberships_self_access" ON org_memberships
  FOR ALL
  USING (user_id = auth.uid());
```

---

## Linear Issues

- **Workspace:** JKBTech
- **Team:** Docket (key: `DOC`)
- **Issue prefix:** Per-phase (FND, EXT, REV, QBO, BIL)
- **Issue IDs in Linear:** DOC-1 through DOC-43

| Project | Issues | Linear IDs | Timeline |
|---------|--------|------------|----------|
| Foundation | 11 issues | DOC-1 to DOC-11 | Weeks 1-3 |
| Upload & Extraction | 7 issues | DOC-12 to DOC-18 | Weeks 3-5 |
| Review & Correction UI | 7 issues | DOC-19 to DOC-25 | Weeks 5-7 |
| QuickBooks Integration | 9 issues | DOC-26 to DOC-34 | Weeks 7-9 |
| Billing & Launch Prep | 9 issues | DOC-35 to DOC-43 | Weeks 9-11 |

**Workflow:**
1. Pull the next issue from Linear by ID (e.g., `DOC-5`)
2. Read the full description (Context/Task/Constraints format)
3. Read any referenced skill files
4. Create feature branch: `git checkout -b feature/FND-5-app-layout-shell`
5. Build within constraints
6. Run completion self-check
7. Output status report
8. Push branch, create PR with `gh pr create`
9. Wait for Joe's review before merge

**Phase gate rule:** Do not begin Phase N+1 work until all Phase N acceptance criteria are met.

---

## Status Report Format

```
STATUS REPORT - DOC-X: [Issue Title]

1. FILES CHANGED
   [filename] - [what changed and why]

2. DEPENDENCIES
   [package] @ [version] - [why added]
   Flag any package not explicitly requested.

3. ACCEPTANCE CRITERIA CHECK
   ✅ [criterion] - confirmed: [how]
   ❌ [criterion] - not met: [why]
   ⚠️ [criterion] - partial: [what's missing]

4. SELF-REVIEW
   a) Shortcuts or compromises to revisit?
   b) Any TypeScript errors suppressed or worked around?
   c) Edge cases not handled?
   d) Files touched outside this issue's scope?
   e) Confidence: High / Medium / Low - [reason]

5. NEXT STEPS
   [Watch items, follow-up issues, risks]
```

---

## Design Tokens

Aesthetic: clean, professional, minimal. Think modern accounting software, not flashy SaaS.

```
Colors (Tailwind config):
  primary:    slate-800     # Sidebar, headers, primary text
  accent:     blue-600      # CTAs, active states, links
  success:    green-600     # Synced status, confidence high
  warning:    amber-500     # Pending review, confidence low
  error:      red-600       # Error status, failed syncs
  background: gray-50       # Page background
  surface:    white         # Cards, panels
  border:     gray-200      # Dividers, input borders

Typography:
  Font:       Inter (Google Fonts) or system font stack
  Headings:   font-semibold
  Body:       font-normal, text-sm or text-base
  Monospace:  font-mono for invoice numbers, amounts

Spacing:
  Page padding:     p-6
  Card padding:     p-4
  Section gap:      space-y-6
  Form field gap:   space-y-4
```

---

## Component Patterns

*(This section grows as patterns are established during the build. Add new patterns here as they emerge.)*

**Form inputs:** All form inputs follow a consistent pattern:
- Label above input (not floating)
- `text-sm font-medium text-gray-700` for labels
- `border border-gray-200 rounded-md px-3 py-2` for inputs
- Error state: `border-red-500` + red error text below
- Disabled state: `bg-gray-100 cursor-not-allowed`

**Status badges:** Use `InvoiceStatusBadge` component for all invoice statuses:
- `extracting`: blue, pulsing dot
- `pending_review`: amber
- `approved`: blue
- `synced`: green
- `error`: red

**Buttons:**
- Primary: `bg-blue-600 text-white hover:bg-blue-700`
- Secondary: `border border-gray-300 text-gray-700 hover:bg-gray-50`
- Danger: `bg-red-600 text-white hover:bg-red-700`
- All buttons: `px-4 py-2 rounded-md font-medium text-sm`

**API response format:** All API routes return consistent JSON shapes:
```typescript
// Success
{ data: T }

// Error
{ error: string, code: string, details?: Record<string, unknown> }

// Codes: VALIDATION_ERROR, AUTH_ERROR, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL_ERROR
```

**Empty states:** Every list view and connection-dependent UI must have an explicit empty state:
- Invoice list (no invoices): "No invoices yet. Upload your first invoice to get started." + CTA button
- No QBO connection: "Connect QuickBooks to start syncing invoices." + CTA to Settings
- No line items extracted: "No line items were extracted. You can add them manually below."
- No vendors in QBO dropdown: "No vendors found. Create vendors in QuickBooks first."

**Pagination:** Invoice list uses cursor-based pagination. Default page size: 25. For MVP volumes (<100 invoices/month), this prevents unbounded queries without adding complexity. No offset-based pagination (breaks with concurrent inserts).

**Required fields for approval:** An invoice cannot be approved unless `extracted_data` has non-null values for: `vendor_name` and `total_amount`. All other fields are optional (the user may not need them for every invoice). The approve button should be disabled with a tooltip explaining which fields are missing.

---

## Testing Strategy

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit tests | Vitest | Pure functions, extraction parsing, encryption, helpers |
| API route tests | Vitest + MSW | Endpoint behavior with mocked external services |
| Component tests | Vitest + Testing Library | Interactive UI components (forms, upload zone) |
| E2E tests | Playwright (Phase 2) | Full user flows — deferred from MVP |

**Test patterns:**
- Test files live next to source: `lib/utils/encryption.test.ts`, `app/api/invoices/upload/route.test.ts`
- External services (Claude, QBO, Stripe) are mocked via MSW (Mock Service Worker), never hit real APIs in tests
- Extraction tests use fixture files: `lib/extraction/__fixtures__/sample-invoice.json`
- Every API route needs at minimum: happy path test, auth failure test, validation error test

**Test commands:**
```
npm run test          # Run all tests (Vitest)
npm run test:watch    # Watch mode for development
npm run test:coverage # Coverage report
```

---

## CI/CD

**GitHub Actions** run on every PR targeting `dev` or `main`:

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    steps:
      - npm ci
      - npm run lint          # ESLint — zero warnings, zero errors
      - npx tsc --noEmit      # TypeScript type check
      - npm run test          # Vitest test suite
      - npm run build         # Next.js production build
```

All four checks must pass before a PR can be merged. No exceptions.

**Vercel integration:**
- Preview deploy on every PR (automatic via Vercel GitHub integration)
- Production deploy on push to `main`

---

## Environment Strategy

| Environment | Supabase | Vercel | QBO | Stripe |
|-------------|----------|--------|-----|--------|
| Local dev | Dev project (local or remote) | `next dev` | Sandbox app | Test mode |
| PR preview | Dev project | Preview deploy | Sandbox app | Test mode |
| Production | Production project | Production deploy | Production app | Live mode |

- Supabase dev and production are separate projects with separate credentials
- Never use production Supabase credentials in local dev or preview deploys
- QBO sandbox and production are separate apps with separate OAuth credentials
- Stripe test mode uses `sk_test_*` keys; live mode uses `sk_live_*` keys
- All environment variables are set in Vercel dashboard per-environment (Preview vs Production)

---

## Common Gotchas

*(This section grows with every session. Every time you learn something the hard way, add it here.)*

**QuickBooks Online:**
- OAuth access tokens expire in 1 hour. Refresh tokens last ~101 days (8726400s). Always auto-refresh before expiry.
- Creating bills (POST) is free/unlimited. Reading data (GET) is metered under the App Partner Program.
- Builder tier: 500K CorePlus credits/month. Enough for ~100 active users.
- VendorRef and AccountRef require the QBO internal ID (`value`), not the display name. Only send `{ value }` on write; QBO fills in `name` in the response.
- Attaching a PDF to a bill is a separate API call via the `/upload` endpoint (multipart form-data), after bill creation. Parts: `file_metadata_0` (JSON) + `file_content_0` (binary).
- Bill creation returns status 200 (not 201). Don't check for 201.
- All QBO IDs are strings, even though they look numeric. Always type as `string`.
- Error response casing is INCONSISTENT: auth errors (401) use lowercase `fault.error`, validation errors (400) use uppercase `Fault.Error`. Error parser must handle both.
- Validation errors include `element` field naming the offending field — map back to UI fields.
- `SyncToken` is required for updates (PUT) but not creates (POST). Must read before updating.
- Sandbox base URL: `https://sandbox-quickbooks.api.intuit.com/v3/company/{companyId}`
- Production base URL: `https://quickbooks.api.intuit.com/v3/company/{companyId}`
- Use `DisplayName` for vendor display (most reliable). `CompanyName` is optional on some vendors.
- For GL account dropdowns, filter `AccountType = 'Expense'`. Use `FullyQualifiedName` for display when `SubAccount: true`.

**Xero (Phase 2, document findings from FND-10 here):**
- Bills are created via PUT (not POST) to the Invoices endpoint with Type "ACCPAY"
- Uses ContactID (not VendorRef) for vendor references
- Different token lifetimes than QBO

**Supabase:**
- Do NOT insert auth users via SQL. Use the Auth Admin API with `email_confirm: true`.
- The `on_auth_user_created` trigger auto-creates profiles. Don't manually insert profiles.
- DELETE statements can silently fail due to RLS. Use `TRUNCATE ... CASCADE` to reliably clear tables in dev.
- MCP `execute_sql` cannot do DML on the `auth` schema. Use Admin API or Dashboard SQL Editor.
- Deterministic UUIDs for seed data (e.g., `a1000000-...`) make test data easy to identify during cleanup.
- For additional Supabase + Next.js troubleshooting patterns (auth sessions, RLS, cookies, connection pooling, CORS, types generation), read: `nocode-to-nextjs/skills/supabase-troubleshooting.md`
- For Vercel deployment troubleshooting (env vars, DNS, ISR, peer deps), read: `nocode-to-nextjs/skills/deployment-troubleshooting.md`

**Vercel:**
- Preview deploys on PR, production on push to `main`.
- "Add Domain" with the redirect checkbox adds both apex + www in one step.
- Env vars must be set in Vercel Dashboard (Settings → Environment Variables). They are NOT auto-synced from `.env.local`.
- New env vars require a **new deployment** to take effect — existing preview deploys won't pick them up. Push a new commit or hit "Redeploy" in the dashboard.
- **Env var environment strategy:** Most vars (Supabase, Anthropic, Encryption) can use "All Environments" during dev since they're all sandbox/dev credentials. Exceptions:
  - `QBO_ENVIRONMENT`: set per-environment (`sandbox` for Preview, `production` for Production)
  - `QBO_REDIRECT_URI`: different per environment (preview URL vs production URL)
  - Stripe keys: different per environment (`sk_test_*` for Preview, `sk_live_*` for Production)
  - When going to production, swap all credentials to production-grade values per-environment.

**DNS:**
- Always copy-paste verification codes. Characters like uppercase I, lowercase l, and 1 are visually ambiguous.
- GoDaddy won't allow a new CNAME if one exists for the same name. Edit the existing record.

**General:**
- Resend has a direct GoDaddy integration for auto-configuring DNS records.
- Fire-and-forget for non-critical operations: email failures must never fail the parent operation.
- Zsh glob quoting: paths with parentheses like `app/(tabs)/advisor.tsx` must be quoted in shell commands.

---

## gstack

For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

**Available skills:**
- `/plan-ceo-review` — CEO/founder-mode plan review
- `/plan-eng-review` — Eng manager-mode plan review
- `/review` — Pre-landing PR review
- `/ship` — Ship workflow (merge, test, bump, PR)
- `/browse` — Fast headless browser for QA and dogfooding
- `/qa` — Systematic QA testing
- `/setup-browser-cookies` — Import cookies from your real browser
- `/retro` — Weekly engineering retrospective

---

## Agent Autonomy

**Just build, don't ask:**
- Implementation details (component structure, hook patterns, utility functions)
- Library usage within the established stack (Supabase client, Stripe SDK, etc.)
- Styling decisions that follow the design tokens above
- TypeScript types, interfaces, error handling, edge cases
- Running lint, build, and verification
- Refactoring within the same file to improve clarity

**Ask before:**
- Adding any dependency not already in package.json
- Changing architectural patterns defined in this file
- Anything involving real money or production environments (Stripe live mode, QBO production credentials)
- Deleting or restructuring existing working code
- Deviating from a Linear issue's constraints
- Modifying database schema beyond what the current issue specifies

---

## Completion Self-Check

Run these before declaring any issue done:

1. `npm run lint` passes clean (zero warnings, zero errors)
2. `npm run build` completes without errors
3. `npx tsc --noEmit` passes with no type errors
4. `npm run test` passes with no failures
5. No `any` types in new code
6. No uncommented `console.log` in production code (use `lib/utils/logger.ts` instead)
7. Server-side secrets not exposed in client bundles (no `NEXT_PUBLIC_` on API keys)
8. RLS policies active on any new tables
9. New decisions recorded in the Decisions Log below
10. Status report delivered in the required format

---

## Decisions Log

*(Reverse chronological. Every non-trivial decision gets recorded here with rationale and the issue that prompted it.)*

| Date | Decision | Rationale | Issue |
|------|----------|-----------|-------|
| 2026-03-15 | Provider interface uses `fileBuffer + mimeType` instead of `fileUrl` | Decouples provider from Supabase Storage — future providers (Google Doc AI) won't need signed URLs. Orchestration layer handles file fetching. | DOC-14 |
| 2026-03-15 | Added `lib/extraction/run.ts` orchestration layer | Separates DB writes and status management from both the API route and the provider. Single shared function for upload auto-trigger and manual retry. | DOC-14 |
| 2026-03-15 | org_memberships join table instead of owner_id-only RLS | Prevents full RLS rewrite in Phase 3 (team accounts). Supports bookkeepers managing multiple businesses. 30 min extra in foundation. | Plan Review |
| 2026-03-15 | AES-256-GCM for token encryption, key rotation deferred to Phase 2 | Industry standard. Random IV per encryption prevents pattern analysis. Single key is fine for <10 users. | Plan Review |
| 2026-03-15 | Vitest + MSW for testing, Playwright deferred to Phase 2 | Vitest is fastest for Next.js. MSW mocks external APIs cleanly. E2E adds too much CI time for MVP. | Plan Review |
| 2026-03-15 | Synchronous extraction with loading state for MVP | Polling/websockets add complexity not justified at <10 users. Revisit when extraction volume requires async. | Plan Review |
| 2026-03-15 | Cursor-based pagination for invoice list | Offset pagination breaks with concurrent inserts. Cursor is correct from day 1. Default page size: 25. | Plan Review |
| 2026-03-15 | Structured JSON logging via logger.ts, no raw console.log | Enables log search/filter in Vercel. Consistent format across all API routes. | Plan Review |
| 2026-03-15 | GitHub Actions CI: lint + typecheck + test + build on every PR | Prevents broken code from reaching dev/main. Automates the completion self-check. | Plan Review |
| 2026-03-15 | Sync idempotency guard via sync_log check before QBO call | Prevents duplicate bills on double-click or timeout-retry. Real-money protection. | Plan Review |
| 2026-03-15 | Server-side file validation by magic bytes, not extension | Prevents malicious file uploads masquerading as PDFs. Security baseline. | Plan Review |
| 2026-03-15 | Processing pipeline on Vercel API routes, not Supabase Edge Functions | Single deployment, single log stream, easier debugging. Can add a queue later without rearchitecting. | Architecture |
| 2026-03-15 | No component libraries (Tailwind only) | Lean bundle, full control over design, consistent aesthetic. | Architecture |
| 2026-03-15 | Claude Vision API as primary extractor, provider-agnostic interface | Best accuracy for invoice extraction. Abstraction allows swapping to Google Doc AI or future providers without rewrite. | Architecture |
| 2026-03-15 | Per-phase Linear prefixes (FND, EXT, REV, QBO, BIL) | Phases have distinct domains. Prefix makes branch names and commits immediately identifiable by domain. | Scaffold |
| 2026-03-15 | First 10 customers free (design partners, not revenue) | Need real invoice data and real feedback before optimizing for revenue. Capped at 100 invoices/month. | Business |
| 2026-03-15 | Single pricing tier for MVP ($99/mo Growth) | One price, one plan, zero decision paralysis for early users. Tiered pricing comes with Phase 2+. | Business |

---

## Test Accounts

*(Populate during FND-4 when auth is set up.)*

| Role | Email | Password | UUID |
|------|-------|----------|------|
| Admin/Owner | TBD | TBD | a1000000-0000-0000-0000-000000000001 |
| Test User | TBD | TBD | c2000000-0000-0000-0000-000000000001 |

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# QuickBooks
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=
QBO_ENVIRONMENT=sandbox    # sandbox | production

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Encryption (for OAuth tokens at rest)
ENCRYPTION_KEY=

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

---

## Sandbox Findings

*(Populated after FND-9, FND-10, FND-11. Paste key findings from scripts/sandbox/sandbox-notes.md here so every session has them.)*

### QBO Sandbox (FND-9) — Validated 2026-03-15
- All 5 API operations confirmed working: query vendors, query accounts, create bill, attach PDF, error handling
- Full findings in `scripts/sandbox/sandbox-notes.md`
- Key surprise: error response casing inconsistent between auth (lowercase) and validation (uppercase) errors
- Key surprise: bill creation returns 200, not 201
- Key surprise: all IDs are strings, not numbers
- Attachment is a two-step process (create bill, then upload attachment separately)
- Multipart upload uses `file_metadata_0` + `file_content_0` part names

### Xero Sandbox (FND-10)
Deferred to Phase 2. Xero requires a paid org for API testing. Key differences documented from docs review.

### AI Extraction (FND-11) — Validated 2026-03-15
- Claude Sonnet via document type (base64 PDF) — 100% accuracy on 5 synthetic invoices
- Cost: ~$0.011/invoice (~$1.11/month at 100 invoices). Negligible.
- Response time: ~3.8 seconds average. Acceptable for synchronous UX with loading spinner.
- Prompt returns structured JSON: vendor, dates, line items, totals, confidence score
- Dates in ISO YYYY-MM-DD, numbers without currency symbols, null for missing fields
- Real invoices (scans, messy layouts) will be lower accuracy — target 80%+ on typed invoices
- Full prompt text and results in `scripts/sandbox/fixtures/extraction-results.json`
