# DOC-55: Xero Token Management — Design Spec

**Issue:** [DOC-55](https://linear.app/jkbtech/issue/DOC-55/xro-4-xero-token-management-encrypted-storage-auto-refresh)
**Date:** 2026-03-20
**Status:** Approved
**Dependencies:** DOC-52 (provider abstraction), DOC-54 (Xero OAuth connect flow)
**Scope:** Token refresh core, connection health check, unit tests. Route-level wiring and adapter integration deferred until DOC-54 lands.

---

## 1. Data Layer

### Migration: `accounting_connections` schema additions

Two new columns on the existing `accounting_connections` table:

```sql
ALTER TABLE accounting_connections
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'expired', 'error'));

ALTER TABLE accounting_connections
  ADD COLUMN refresh_token_expires_at TIMESTAMPTZ;
```

**`status`** tracks connection health:
- `active` — tokens are valid or refreshable
- `expired` — refresh token is dead, user must reconnect
- `error` — refresh failed for non-expiry reasons (e.g., user revoked access in Xero)

Reconnecting via OAuth does an upsert that flips status back to `active`.

**`refresh_token_expires_at`** stores when the refresh token dies:
- Xero: 60 days from last refresh
- QBO: ~101 days from last refresh
- Updated on every token refresh and on initial OAuth connect
- Nullable so existing QBO rows aren't broken by the migration

No new tables.

---

## 2. Token Refresh Core (`lib/xero/auth.ts`)

### `refreshXeroTokens(encryptedRefreshToken, connectionId)`

1. Decrypt refresh token using `lib/utils/encryption.ts`
2. POST to `https://identity.xero.com/connect/token`:
   - `grant_type=refresh_token`
   - `refresh_token={decrypted}`
   - Authorization header: Basic base64(`client_id:client_secret`)
3. Xero returns new access token (30 min lifetime) + **new refresh token** (rotated — old one is invalidated)
4. Encrypt both new tokens using `encrypt()`
5. Update `accounting_connections` row:
   - `access_token` = encrypted new access token
   - `refresh_token` = encrypted new refresh token
   - `token_expires_at` = now + `expires_in` seconds
   - `refresh_token_expires_at` = now + 60 days
   - `status` = `active`
6. **DB write retries:** 3 attempts with exponential backoff (100ms, 200ms, 400ms). On exhaustion: log critical error with `connectionId`, hold tokens in memory for current process lifetime
7. Return decrypted access token + tenant ID (from `company_id` column)

**Why retries matter:** Xero rotates refresh tokens. A successful refresh + failed DB write means the new tokens exist only in memory and the old tokens in the DB are dead. Retries cover transient DB blips. The in-memory fallback keeps the current process alive until the next deployment or restart.

### `getValidXeroTokens(connectionId, orgId)`

1. Check concurrency lock map — if another caller is already refreshing for this org, await their result
2. Load connection row from DB
3. If `status = 'expired'` or `status = 'error'`: throw `ConnectionExpiredError` immediately (no refresh attempted)
4. Decrypt access token, check `token_expires_at`
5. If expiring within **5 minutes** (buffer for clock skew and long-running API calls):
   - Acquire lock (set promise in `refreshLocks` Map keyed by `orgId`)
   - Call `refreshXeroTokens()`
   - Release lock (delete from Map in `finally` block)
6. If refresh fails with `invalid_grant` (dead refresh token): set `status = 'expired'` in DB, throw `ConnectionExpiredError`
7. If refresh fails with other error: retry up to 3x, then set `status = 'error'` in DB, throw
8. Return `{ accessToken, tenantId }`

### Concurrency Lock

Same `Map<string, Promise<{ accessToken: string; tenantId: string }>>` pattern as QBO (`lib/quickbooks/auth.ts`). Key is `orgId`. First caller refreshes; concurrent callers await the same promise.

Critical for Xero: the rotating refresh token means a second concurrent refresh call would send an already-dead refresh token, causing `invalid_grant` and marking the connection expired erroneously.

---

## 3. Connection Health Check

### Server-side (Settings page load)

When the Settings page fetches the Xero connection via `getOrgConnection()`, the `refresh_token_expires_at` column drives the health display:

| Condition | Behavior |
|-----------|----------|
| `refresh_token_expires_at` is > 7 days away | Healthy — show connected status |
| `refresh_token_expires_at` is within 7 days | Show warning banner (see below) |
| `refresh_token_expires_at` is in the past | Set `status = 'expired'`, show reconnect prompt |
| `status = 'expired'` or `status = 'error'` | Show reconnect prompt |

### Warning banner UI

When the refresh token is within 7 days of expiry:

> "Your Xero connection expires in X days. Reconnect now to avoid interruption."

With a "Reconnect" button that triggers the same OAuth flow. The upsert overwrites the row, resets status to `active`, and sets fresh token expiry timestamps.

### Reconnect prompt UI

When the connection is expired or errored:

> "Your Xero connection has expired. Please reconnect to continue syncing."

With a "Reconnect" button. The existing connection metadata (tenant name) is preserved in the row so the UI can show "Reconnect to [Company Name]" rather than a generic "Connect Xero".

---

## 4. Error Handling & Logging

### Structured log events

All events use `lib/utils/logger.ts`. Never raw `console.log`. Never log token values.

| Event | Level | Fields |
|-------|-------|--------|
| `xero.token_refresh_success` | info | `orgId`, `connectionId`, `durationMs` |
| `xero.token_refresh_coalesced` | info | `orgId` (concurrent caller awaited existing refresh) |
| `xero.token_refresh_failed` | error | `orgId`, `connectionId`, `errorType`, `attempt` |
| `xero.token_refresh_db_write_failed` | error | `orgId`, `connectionId`, `attempt`, `maxAttempts` |
| `xero.token_refresh_exhausted` | error | `orgId`, `connectionId` (critical — tokens in memory only) |
| `xero.connection_expired` | warn | `orgId`, `connectionId` (refresh token dead) |
| `xero.connection_expiry_warning` | info | `orgId`, `daysRemaining` |

### User-facing error messages

| Scenario | User sees |
|----------|-----------|
| Refresh succeeds transparently | Nothing — seamless |
| Refresh token expired (60 days no use) | "Your Xero connection has expired. Please reconnect." + Reconnect button |
| User revoked access in Xero portal | "Your Xero connection was revoked. Please reconnect." + Reconnect button |
| Transient refresh failure (retries exhausted) | "Unable to connect to Xero. Please try again in a few minutes." |
| Connection status is `error` | "There's a problem with your Xero connection. Please reconnect." + Reconnect button |

### Sentry integration

All `logger.error()` calls auto-capture to Sentry with context tags (existing behavior). The `xero.token_refresh_exhausted` event is high-severity since tokens exist only in memory and will be lost on process restart.

---

## 5. Testing Strategy

### Unit tests (`lib/xero/auth.test.ts`)

| Test | What it validates |
|------|-------------------|
| Successful refresh | Decrypts old token, calls Xero endpoint, encrypts new tokens, updates DB row with new `token_expires_at` and `refresh_token_expires_at` |
| Expired access token triggers refresh | `getValidXeroTokens` detects <5 min remaining, calls refresh, returns new token |
| Valid access token skips refresh | `getValidXeroTokens` returns existing token without hitting Xero |
| Expired refresh token → `ConnectionExpiredError` | Xero returns `invalid_grant`, status set to `expired`, error thrown |
| Non-grant refresh failure → retries | Simulates 500 from Xero, verifies 3 retry attempts with backoff |
| DB write failure → retries | Simulates Supabase error on update, verifies 3 retry attempts |
| DB write exhaustion → in-memory fallback | All 3 DB writes fail, tokens still returned, critical error logged |
| Concurrency lock coalescing | Two concurrent `getValidXeroTokens` calls, verify only one Xero HTTP request fired |
| Connection status `expired` → immediate throw | No refresh attempted, `ConnectionExpiredError` thrown |
| Connection status `error` → immediate throw | Same behavior |
| Tokens never logged | Mock logger, verify no token values in any log call args |

### Mocking

- **MSW:** Mock `https://identity.xero.com/connect/token` for refresh responses (success, `invalid_grant`, 500)
- **Supabase client:** Mocked for DB reads/writes (success + failure scenarios)
- **Encryption:** Use real `encrypt()`/`decrypt()` with a test `ENCRYPTION_KEY`

### Out of scope

E2E tests deferred to DOC-61 (end-to-end Xero flow).

---

## Files Touched

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/XXXXXX_add_connection_status.sql` | New | Add `status` and `refresh_token_expires_at` columns |
| `lib/xero/auth.ts` | Modified (extend from DOC-54) | `refreshXeroTokens()`, `getValidXeroTokens()`, concurrency lock |
| `lib/xero/auth.test.ts` | New | Unit tests for all token management scenarios |
| `app/(dashboard)/settings/page.tsx` | Modified | Health check logic, warning banner, reconnect prompt |
| `lib/accounting/connection.ts` | Modified | Include `status` and `refresh_token_expires_at` in `AccountingConnectionInfo` |

---

## Deferred (until DOC-54 lands)

- Wiring `refreshTokens()` into the Xero adapter's `AccountingProvider` interface
- Route-level integration (API routes calling `getValidXeroTokens` before Xero API calls)
- Updating DOC-54's OAuth callback to set `refresh_token_expires_at` on initial connect

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Retry-first with in-memory fallback for DB write failures | Covers transient DB issues at any scale. In-memory fallback keeps current process alive. Monitoring via Sentry catches systemic failures. |
| `status` column instead of deleting expired connections | Preserves tenant name for "Reconnect to [Company]" UX. Enables connection health metrics. Supports future automated expiry notification emails. |
| `refresh_token_expires_at` column | Can't derive refresh token health from `token_expires_at` (which tracks the 30-min access token). Explicit column enables the 7-day warning. |
| 5-minute refresh buffer | Matches QBO pattern. Prevents failures on long-running API calls that start with a valid token but expire mid-flight. |
| Concurrency lock keyed by orgId | Prevents concurrent refresh calls from sending dead rotated tokens. Same proven pattern as QBO. |
