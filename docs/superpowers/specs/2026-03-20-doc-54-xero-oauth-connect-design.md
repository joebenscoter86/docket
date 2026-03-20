# DOC-54: Xero OAuth2 Connect Flow (PKCE + Callback)

## Overview

Build the Xero OAuth2 connect/callback/disconnect flow, mirroring the existing QBO OAuth pattern but with PKCE (Proof Key for Code Exchange) and Xero's tenant selection step. This issue creates the auth plumbing — no Xero API adapter, no Settings UI component, no provider switching logic.

## Design Decision: Parallel Structure, Minimal Sharing (Option A)

`lib/xero/auth.ts` is a standalone module mirroring `lib/quickbooks/auth.ts`. Each provider owns its full auth lifecycle. Shared utilities (state generation, encryption) are already in `lib/utils/`. The two modules don't know about each other.

**Why:** The OAuth flows are genuinely different (PKCE vs no PKCE, tenant selection vs realmId, different token lifetimes, different endpoints). Forcing them into a shared abstraction creates more complexity than it removes. The provider abstraction layer (DOC-52) already handles the shared API interface — auth is provider-specific by nature.

## File Structure

```
lib/xero/
  auth.ts          # OAuth2+PKCE helpers
  types.ts         # Xero-specific OAuth types

app/api/
  xero/
    connect/route.ts       # GET — initiate OAuth2+PKCE flow
    disconnect/route.ts    # POST — revoke + delete connection
  auth/callback/
    xero/route.ts          # GET — handle callback, store tokens
```

No changes to any QBO files. No changes to the provider abstraction layer.

## Types (`lib/xero/types.ts`)

```typescript
// Token response from Xero's token endpoint (confirmed in DOC-53 sandbox)
interface XeroTokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number;        // 1800 (30 min)
  token_type: "Bearer";
  refresh_token: string;
  scope: string;
}

// Internal representation after token exchange
interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// From GET /connections
interface XeroTenant {
  id: string;                // UUID
  authEventId: string;
  tenantId: string;          // UUID — stored as company_id
  tenantType: string;        // "ORGANISATION"
  tenantName: string;        // stored as company_name
  createdDateUtc: string;
  updatedDateUtc: string;
}
```

No Xero API types (contacts, accounts, bills) in this file — those belong in a future `lib/accounting/xero/` adapter (DOC-55+).

## Auth Helpers (`lib/xero/auth.ts`)

| Function | Purpose |
|----------|---------|
| `generatePKCE()` | Returns `{ codeVerifier, codeChallenge }`. Verifier: 32 random bytes → base64url (43 chars). Challenge: SHA256(verifier) → base64url. |
| `generateState()` | 32 random bytes, hex-encoded. Own copy (parallel to QBO, not shared). |
| `getAuthorizationUrl(state, codeChallenge)` | Builds auth URL at `https://login.xero.com/identity/connect/authorize` with scopes, PKCE, redirect URI. |
| `exchangeCodeForTokens(code, codeVerifier)` | POST to `https://identity.xero.com/connect/token` with `grant_type=authorization_code`, code, code_verifier. Uses Basic auth header: `base64(client_id:client_secret)`. Returns `XeroTokens`. |
| `getXeroTenantId(accessToken)` | GET `https://api.xero.com/connections`. Returns first tenant's `tenantId` and `tenantName`. **Throws** if the array is empty (user authorized zero orgs). |
| `refreshAccessToken(refreshToken)` | POST to token endpoint with `grant_type=refresh_token`. Per-org concurrency lock (same `refreshLocks` Map pattern as QBO). **Must store the new refresh token** — old one is invalidated on use. |
| `storeConnection(supabase, orgId, tokens, tenantId, tenantName?)` | Encrypt tokens via `lib/utils/encryption.ts`, upsert to `accounting_connections` with `provider = 'xero'`, `company_id = tenantId`. Uses `onConflict: "org_id,provider"`. |
| `loadConnection(supabase, orgId)` | Fetch raw row from `accounting_connections` where `provider = 'xero'`. Returns the existing `AccountingConnectionRow` type (already supports `provider: 'xero'` via DOC-52). |
| `getValidAccessToken(supabase, orgId)` | Load connection, auto-refresh if within 5-min buffer of expiry, return decrypted access token. 30-min token lifetime means refreshes fire more often than QBO. |
| `isConnected(supabase, orgId)` | Check if connection row exists for `provider = 'xero'`. |
| `disconnect(supabase, orgId)` | Best-effort POST to `https://identity.xero.com/connect/revocation` with `application/x-www-form-urlencoded` body (`token=<refresh_token>` per RFC 7009 — different from QBO's JSON body). Fire-and-forget on failure, then delete row. |

### Concurrency Lock on Token Refresh

Critical for Xero because refresh tokens rotate — if two concurrent requests both try to refresh with the same token, the second one will fail because the first refresh invalidated it. The per-org lock pattern from `lib/quickbooks/auth.ts` (using a `Map<string, Promise>`) coalesces concurrent refresh attempts into a single call.

### Xero-Specific: Scopes

Confirmed in DOC-53 sandbox validation: apps created after March 2, 2026 must use granular scopes. The old `accounting.transactions` scope does not work.

**Required scopes:** `openid offline_access accounting.invoices accounting.contacts accounting.settings accounting.attachments`

### Xero-Specific: Token Lifetimes

| Token | Lifetime | Notes |
|-------|----------|-------|
| Access token | 30 min (1800s) | Confirmed in DOC-53. Half of QBO's 1 hour. |
| Refresh token | ~60 days | From Xero docs; not confirmed empirically. |

Refresh token lifetime was not tested empirically in DOC-53. The code must handle re-auth gracefully if a refresh fails with an invalid token error (same pattern as QBO).

## Route Behaviors

### `GET /api/xero/connect`

1. Verify Supabase session (redirect to `/login` if not authenticated)
2. Get `org_id` from `org_memberships`
3. Generate PKCE pair: `{ codeVerifier, codeChallenge }`
4. Generate state: 32 random bytes, hex-encoded
5. Read optional `returnTo` query param, validate against allowlist (`/settings`, `/onboarding/connect`)
6. Set single httpOnly cookie `xero_oauth_pkce` containing JSON: `{ state, codeVerifier, returnTo? }`
   - `httpOnly: true`, `sameSite: "lax"`, `secure` (based on protocol), `maxAge: 600`, `path: "/"`
7. Redirect to Xero auth URL with: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`
8. Structured logging at entry and exit

**Cookie approach:** One JSON cookie (not separate cookies like QBO uses for state + returnTo). The verifier and state are always needed together and always cleaned up together.

### `GET /api/auth/callback/xero`

1. Read `code`, `state` from query params
2. Read `xero_oauth_pkce` cookie, parse JSON → `{ state: savedState, codeVerifier, returnTo }`
3. **CSRF check:** `savedState === state` — if mismatch, clear cookie, redirect to `/settings?xero_error=csrf_failed`
4. Verify Supabase session
5. Get `org_id` from `org_memberships`
6. Exchange code + codeVerifier for tokens (Basic auth header)
7. Call `/connections` → get first tenant's `tenantId` and `tenantName`
8. Encrypt access + refresh tokens with `lib/utils/encryption.ts`
9. Upsert to `accounting_connections`: `provider = 'xero'`, `company_id = tenantId`, `company_name = tenantName`, `token_expires_at = now() + expires_in`
10. Clear `xero_oauth_pkce` cookie
11. Redirect to `returnTo || '/settings'` with `?xero_success=true`

**Error cases:** User denies auth, missing code/state, CSRF mismatch, session expired, no org, token exchange failure, `/connections` returns empty array — all redirect to Settings with `?xero_error=<reason>`.

### `POST /api/xero/disconnect`

1. Verify Supabase session + org_id
2. Call `disconnect(supabase, orgId)` which:
   - Loads connection, decrypts refresh token
   - Best-effort POST to `https://identity.xero.com/connect/revocation` (fire-and-forget)
   - Deletes `accounting_connections` row where `provider = 'xero'`
3. Redirect to `/settings?xero_disconnected=true`

All three routes use structured logging at entry and exit (same `logger.info()` pattern as QBO routes).

## Environment Variables

Add to `.env.example`:

```
# Xero OAuth2
XERO_CLIENT_ID=              # Xero developer app client ID
XERO_CLIENT_SECRET=          # Xero developer app client secret
XERO_REDIRECT_URI=http://localhost:3000/api/auth/callback/xero
```

Per-environment strategy in Vercel (mirrors QBO pattern):
- Preview: sandbox Xero app credentials
- Production: production Xero app credentials

## DOC-53 Findings Incorporated

All sandbox validation findings relevant to OAuth are incorporated into this design:

| Finding | How it's addressed |
|---------|--------------------|
| Granular scopes required (post-March-2026) | Scopes list uses `accounting.invoices` not `accounting.transactions` |
| PKCE verifier is 43 chars | `generatePKCE()` uses 32 random bytes → base64url |
| Basic auth on token exchange | `exchangeCodeForTokens()` uses `Authorization: Basic base64(id:secret)` |
| Refresh tokens rotate on use | Per-org concurrency lock + always store new refresh token |
| 30-min access token lifetime | 5-min refresh buffer works (fires at 25 min) |
| Token response includes `id_token` | Type includes it; we don't use it but don't reject it |

## Scope Boundaries

**In scope (DOC-54):**
- `lib/xero/auth.ts` — all OAuth helpers
- `lib/xero/types.ts` — OAuth types only
- Three API routes (connect, callback, disconnect)
- `.env.example` updates

**Out of scope (downstream issues):**
- Xero API adapter implementing `AccountingProvider` interface (DOC-55+)
- Settings UI / XeroConnectionCard component (DOC-60)
- Provider switching logic (DOC-60)
- Multi-tenant selection (if user authorizes multiple Xero orgs — flag for DOC-60)
- Xero-specific error parsing for API calls (DOC-55+)

## Testing Strategy

- Unit tests for `generatePKCE()` — verify verifier length (43 chars), challenge is valid base64url, challenge matches SHA256 of verifier
- Unit tests for `generateState()` — verify 64-char hex string
- API route tests with MSW for token exchange, `/connections` call, revocation
- Auth failure test: CSRF mismatch returns error redirect
- Auth failure test: missing code/state returns error redirect
- Token refresh test: verify concurrency lock coalesces parallel refreshes
- Token refresh test: verify new refresh token is stored after refresh
