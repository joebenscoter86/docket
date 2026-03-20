# DOC-55: Xero Token Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted token refresh with retry/fallback, connection health status tracking, and expiry warnings for Xero connections — extending the base auth module from DOC-54.

**Architecture:** Extends `lib/xero/auth.ts` (from DOC-54) with `refreshXeroTokens()` and enhanced `getValidXeroTokens()` that check connection status, handle `invalid_grant`, and retry DB writes. Adds `status` and `refresh_token_expires_at` columns to `accounting_connections`. Updates QBO auth for parity. Settings page gains health check warnings.

**Tech Stack:** Next.js 14 (App Router), Supabase Postgres, AES-256-GCM encryption, Vitest + MSW for testing.

**Spec:** `docs/superpowers/specs/2026-03-20-doc-55-xero-token-management-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260320000000_add_connection_status.sql` | Create | Add `status` and `refresh_token_expires_at` columns to `accounting_connections` |
| `lib/accounting/types.ts` | Modify | Add `ConnectionExpiredError` class, update `AccountingConnectionInfo` |
| `lib/accounting/connection.ts` | Modify | Select new columns, map to `AccountingConnectionInfo` |
| `lib/xero/types.ts` | Modify | Add `status` and `refresh_token_expires_at` to `AccountingConnectionRow` |
| `lib/xero/auth.ts` | Modify | Add `refreshXeroTokens()`, enhance `getValidXeroTokens()` and `storeConnection()` with status + retries |
| `lib/xero/auth.test.ts` | Modify | Add tests for all new token management scenarios |
| `lib/quickbooks/types.ts` | Modify | Add `status` and `refresh_token_expires_at` to `AccountingConnectionRow` |
| `lib/quickbooks/auth.ts` | Modify | Update `storeConnection` and `refreshAccessToken` flow to write `refresh_token_expires_at`, use `ConnectionExpiredError` |
| `components/settings/ConnectionHealthBanner.tsx` | Create | Expiry warning and reconnect prompt component |
| `app/(dashboard)/settings/page.tsx` | Modify | Wire health check data to `ConnectionHealthBanner` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260320000000_add_connection_status.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add connection health status and refresh token expiry tracking.
-- Existing QBO rows get status='active' (Postgres backfills DEFAULT on NOT NULL ADD COLUMN).
-- refresh_token_expires_at is nullable so existing rows are unaffected.

ALTER TABLE accounting_connections
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'expired', 'error'));

ALTER TABLE accounting_connections
  ADD COLUMN refresh_token_expires_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run: `mcp__claude_ai_Supabase__apply_migration` with the SQL above.
Expected: Migration applied successfully.

- [ ] **Step 3: Verify columns exist**

Run: `mcp__claude_ai_Supabase__execute_sql` with `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'accounting_connections' AND column_name IN ('status', 'refresh_token_expires_at');`
Expected: Two rows — `status` (text, NO, 'active') and `refresh_token_expires_at` (timestamp with time zone, YES, null).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260320000000_add_connection_status.sql
git commit -m "feat: add status and refresh_token_expires_at to accounting_connections (DOC-55)"
```

---

## Task 2: Add `ConnectionExpiredError` and Update Shared Types

**Files:**
- Modify: `lib/accounting/types.ts`
- Modify: `lib/accounting/connection.ts`

- [ ] **Step 1: Write failing test — ConnectionExpiredError**

Create `lib/accounting/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ConnectionExpiredError } from "./types";

describe("ConnectionExpiredError", () => {
  it("sets name, provider, and orgId", () => {
    const err = new ConnectionExpiredError("xero", "org-123");
    expect(err.name).toBe("ConnectionExpiredError");
    expect(err.provider).toBe("xero");
    expect(err.orgId).toBe("org-123");
    expect(err.message).toContain("xero");
    expect(err.message).toContain("org-123");
  });

  it("accepts a custom message", () => {
    const err = new ConnectionExpiredError("quickbooks", "org-1", "custom msg");
    expect(err.message).toBe("custom msg");
  });

  it("is an instance of Error", () => {
    const err = new ConnectionExpiredError("xero", "org-1");
    expect(err).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/accounting/types.test.ts`
Expected: FAIL — `ConnectionExpiredError` is not exported from `./types`.

- [ ] **Step 3: Add `ConnectionExpiredError` to `lib/accounting/types.ts`**

Add after the `AccountingApiError` class (around line 121):

```typescript
// ─── Connection Error ───

/**
 * Thrown when an accounting connection's refresh token is expired, revoked,
 * or otherwise unusable. Signals that the user must re-authorize.
 * Shared across QBO and Xero.
 */
export class ConnectionExpiredError extends Error {
  public readonly provider: AccountingProviderType;
  public readonly orgId: string;

  constructor(provider: AccountingProviderType, orgId: string, message?: string) {
    super(message ?? `${provider} connection expired for org ${orgId}`);
    this.name = "ConnectionExpiredError";
    this.provider = provider;
    this.orgId = orgId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/accounting/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `AccountingConnectionInfo` in `lib/accounting/types.ts`**

Add two optional fields to the interface (around line 14, before the closing `}`):

```typescript
  status?: 'active' | 'expired' | 'error';
  refreshTokenExpiresAt?: string | null;
```

- [ ] **Step 6: Update `getOrgConnection` in `lib/accounting/connection.ts`**

Update the `.select()` call on line 19 to include new columns:

```typescript
    .select("id, org_id, provider, company_id, company_name, connected_at, status, refresh_token_expires_at")
```

Update the return object (around line 27) to include new fields:

```typescript
  return {
    id: data.id as string,
    orgId: data.org_id as string,
    provider: data.provider as AccountingProviderType,
    companyId: data.company_id as string,
    companyName: (data.company_name as string | undefined) ?? undefined,
    connectedAt: data.connected_at as string,
    status: (data.status as 'active' | 'expired' | 'error') ?? undefined,
    refreshTokenExpiresAt: (data.refresh_token_expires_at as string | null) ?? null,
  };
```

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/accounting/types.ts lib/accounting/types.test.ts lib/accounting/connection.ts
git commit -m "feat: add ConnectionExpiredError and connection health fields (DOC-55)"
```

---

## Task 3: Update `AccountingConnectionRow` Types

**Files:**
- Modify: `lib/xero/types.ts`
- Modify: `lib/quickbooks/types.ts`

- [ ] **Step 1: Add new columns to Xero's `AccountingConnectionRow`**

In `lib/xero/types.ts`, add to the `AccountingConnectionRow` interface (before the closing `}`):

```typescript
  status?: string;
  refresh_token_expires_at?: string | null;
```

- [ ] **Step 2: Add new columns to QBO's `AccountingConnectionRow`**

In `lib/quickbooks/types.ts`, add to the `AccountingConnectionRow` interface (before the closing `}`):

```typescript
  status?: string;
  refresh_token_expires_at?: string | null;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/xero/types.ts lib/quickbooks/types.ts
git commit -m "feat: add status and refresh_token_expires_at to AccountingConnectionRow (DOC-55)"
```

---

## Task 4: Enhance Xero `storeConnection` with Status + Refresh Token Expiry

**Files:**
- Modify: `lib/xero/auth.ts`
- Modify: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing test — storeConnection writes status and refresh_token_expires_at**

Add to the existing `describe("storeConnection", ...)` block in `lib/xero/auth.test.ts`:

```typescript
  it("writes status='active' and refresh_token_expires_at ~60 days out", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    const { storeConnection } = await import("./auth");
    const beforeCall = Date.now();
    await storeConnection(
      mockSupabase as never,
      "org-123",
      { accessToken: "raw_access", refreshToken: "raw_refresh", expiresIn: 1800 },
      "tenant-uuid-1",
      "Acme Ltd"
    );

    const [upsertData] = mockUpsert.mock.calls[0];
    expect(upsertData.status).toBe("active");

    // refresh_token_expires_at should be ~60 days from now
    const refreshExpiry = new Date(upsertData.refresh_token_expires_at).getTime();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    expect(refreshExpiry).toBeGreaterThanOrEqual(beforeCall + sixtyDaysMs - 5000);
    expect(refreshExpiry).toBeLessThanOrEqual(beforeCall + sixtyDaysMs + 5000);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/xero/auth.test.ts -t "writes status"`
Expected: FAIL — `upsertData.status` is undefined.

- [ ] **Step 3: Update `storeConnection` in `lib/xero/auth.ts`**

Add `XERO_REFRESH_TOKEN_LIFETIME_MS` constant near the top (after `TOKEN_EXPIRY_BUFFER_MS`):

```typescript
// Xero refresh tokens expire after 60 days of non-use
const XERO_REFRESH_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;
```

Update the upsert data object in `storeConnection` (around line 195-206) to include:

```typescript
      status: "active",
      refresh_token_expires_at: new Date(
        Date.now() + XERO_REFRESH_TOKEN_LIFETIME_MS
      ).toISOString(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/xero/auth.test.ts -t "writes status"`
Expected: PASS.

- [ ] **Step 5: Run all existing Xero tests to ensure nothing broke**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat: storeConnection writes status and refresh_token_expires_at (DOC-55)"
```

---

## Task 5: Implement `refreshXeroTokens` with DB Write Retries

**Files:**
- Modify: `lib/xero/auth.ts`
- Modify: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing test — successful refresh stores rotated tokens**

Add a new `describe("refreshXeroTokens", ...)` block in `lib/xero/auth.test.ts`:

```typescript
describe("refreshXeroTokens", () => {
  const MOCK_REFRESH_RESPONSE = {
    id_token: "id_tok",
    access_token: "new_access",
    expires_in: 1800,
    token_type: "Bearer" as const,
    refresh_token: "new_refresh",
    scope: "openid offline_access",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_REFRESH_RESPONSE,
    }) as typeof fetch;
  });

  it("decrypts old token, calls Xero, encrypts new tokens, updates DB with status and expiry", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const { refreshXeroTokens } = await import("./auth");
    const result = await refreshXeroTokens(
      mockSupabase as never,
      "enc_old_refresh",
      "conn-123",
      "org-1",
      "tenant-1"
    );

    expect(result.accessToken).toBe("new_access");
    expect(result.tenantId).toBe("tenant-1");

    // Verify DB update was called with encrypted tokens + status + refresh expiry
    const [updateData] = mockUpdate.mock.calls[0];
    expect(updateData.access_token).toBe("enc_new_access");
    expect(updateData.refresh_token).toBe("enc_new_refresh");
    expect(updateData.status).toBe("active");
    expect(updateData.refresh_token_expires_at).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/xero/auth.test.ts -t "decrypts old token"`
Expected: FAIL — `refreshXeroTokens` is not exported.

- [ ] **Step 3: Implement `refreshXeroTokens`**

Add the following function to `lib/xero/auth.ts` after the `refreshAccessToken` function:

```typescript
/**
 * Refresh Xero tokens and persist the rotated tokens to DB.
 * Retries DB writes up to 3 times with exponential backoff because
 * Xero rotates refresh tokens — a failed DB write after successful refresh
 * means the new tokens exist only in memory and the old DB tokens are dead.
 *
 * Returns { accessToken, tenantId } on success.
 */
export async function refreshXeroTokens(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  encryptedRefreshToken: string,
  connectionId: string,
  orgId: string,
  tenantId: string
): Promise<{ accessToken: string; tenantId: string }> {
  const startTime = Date.now();
  const decryptedRefresh = decrypt(encryptedRefreshToken);

  // Call Xero token endpoint
  const tokenResponse = await refreshAccessToken(decryptedRefresh);

  // Encrypt new tokens
  const encryptedAccess = encrypt(tokenResponse.access_token);
  const encryptedNewRefresh = encrypt(tokenResponse.refresh_token);
  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
  const refreshExpiresAt = new Date(
    Date.now() + XERO_REFRESH_TOKEN_LIFETIME_MS
  );

  // Retry DB write up to 3 times with exponential backoff
  const MAX_RETRIES = 3;
  const BACKOFF_BASE_MS = 100;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from("accounting_connections")
      .update({
        access_token: encryptedAccess,
        refresh_token: encryptedNewRefresh,
        token_expires_at: expiresAt.toISOString(),
        refresh_token_expires_at: refreshExpiresAt.toISOString(),
        status: "active",
      })
      .eq("id", connectionId);

    if (!error) {
      logger.info("xero.token_refresh_success", {
        orgId,
        connectionId,
        durationMs: String(Date.now() - startTime),
      });
      return { accessToken: tokenResponse.access_token, tenantId };
    }

    lastError = new Error(error.message);
    logger.error("xero.token_refresh_db_write_failed", {
      orgId,
      connectionId,
      attempt: String(attempt),
      maxAttempts: String(MAX_RETRIES),
      error: error.message,
    });

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt - 1)));
    }
  }

  // All retries exhausted — tokens exist only in memory
  logger.error("xero.token_refresh_exhausted", {
    orgId,
    connectionId,
    error: lastError?.message ?? "unknown",
  });

  // Return in-memory tokens as fallback (process-lifetime only)
  return { accessToken: tokenResponse.access_token, tenantId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/xero/auth.test.ts -t "decrypts old token"`
Expected: PASS.

- [ ] **Step 5: Write failing test — DB write failure triggers retries**

Add to the `describe("refreshXeroTokens", ...)` block:

```typescript
  it("retries DB writes up to 3 times on failure", async () => {
    let updateCallCount = 0;
    const mockUpdate = vi.fn().mockImplementation(() => {
      updateCallCount++;
      return {
        eq: vi.fn().mockResolvedValue({
          error: updateCallCount <= 2 ? { message: "DB error" } : null,
        }),
      };
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const { refreshXeroTokens } = await import("./auth");
    await refreshXeroTokens(
      mockSupabase as never,
      "enc_old_refresh",
      "conn-123",
      "org-1",
      "tenant-1"
    );

    // Should have retried: 2 failures + 1 success = 3 calls
    expect(updateCallCount).toBe(3);
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/xero/auth.test.ts -t "retries DB writes"`
Expected: PASS (implementation already handles this).

- [ ] **Step 7: Write failing test — DB write exhaustion returns in-memory fallback**

Add to the `describe("refreshXeroTokens", ...)` block:

```typescript
  it("returns in-memory tokens when all 3 DB writes fail", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "persistent DB error" } }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const { refreshXeroTokens } = await import("./auth");
    const result = await refreshXeroTokens(
      mockSupabase as never,
      "enc_old_refresh",
      "conn-123",
      "org-1",
      "tenant-1"
    );

    // Still returns tokens from in-memory fallback
    expect(result.accessToken).toBe("new_access");
    expect(result.tenantId).toBe("tenant-1");

    // All 3 attempts were made
    expect(mockUpdate).toHaveBeenCalledTimes(3);
  });
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run lib/xero/auth.test.ts -t "returns in-memory tokens"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat: add refreshXeroTokens with DB write retries and fallback (DOC-55)"
```

---

## Task 6: Enhance `getValidXeroTokens` with Status Checks and `invalid_grant` Handling

**Files:**
- Modify: `lib/xero/auth.ts`
- Modify: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing test — expired status throws immediately**

Add a new `describe` block or extend the existing `getValidAccessToken` tests:

```typescript
describe("getValidAccessToken — status checks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
  });

  it("throws ConnectionExpiredError immediately when status is 'expired'", async () => {
    const expiredConnection = {
      id: "conn-1",
      status: "expired",
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      company_id: "tenant-1",
      company_name: "Acme",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: expiredConnection, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");
    const { ConnectionExpiredError } = await import("@/lib/accounting/types");

    await expect(getValidAccessToken(mockSupabase as never, "org-1")).rejects.toThrow(
      ConnectionExpiredError
    );
  });

  it("throws ConnectionExpiredError immediately when status is 'error'", async () => {
    const errorConnection = {
      id: "conn-1",
      status: "error",
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      company_id: "tenant-1",
      company_name: "Acme",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: errorConnection, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");
    const { ConnectionExpiredError } = await import("@/lib/accounting/types");

    await expect(getValidAccessToken(mockSupabase as never, "org-1")).rejects.toThrow(
      ConnectionExpiredError
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/xero/auth.test.ts -t "status checks"`
Expected: FAIL — `getValidAccessToken` doesn't check status.

- [ ] **Step 3: Rewrite `getValidAccessToken` in `lib/xero/auth.ts`**

Replace the existing `getValidAccessToken` function (around lines 294-372) with the enhanced version. Add import at the top of the file:

```typescript
import { ConnectionExpiredError } from "@/lib/accounting/types";
```

Replace the function:

```typescript
export async function getValidAccessToken(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<{ accessToken: string; tenantId: string }> {
  const connection = await loadConnection(supabase, orgId);

  if (!connection) {
    throw new Error(
      "No Xero connection found. Connect Xero in Settings first."
    );
  }

  // Check connection status before attempting anything
  if (connection.status === "expired" || connection.status === "error") {
    throw new ConnectionExpiredError("xero", orgId);
  }

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // If token is still valid (with buffer), decrypt and return
  if (expiresAt.getTime() - now.getTime() > TOKEN_EXPIRY_BUFFER_MS) {
    return {
      accessToken: decrypt(connection.access_token),
      tenantId: connection.company_id,
    };
  }

  // Token expired or about to expire — coalesce concurrent refresh calls
  const existing = refreshLocks.get(orgId);
  if (existing) {
    logger.info("xero.token_refresh_coalesced", { orgId });
    return existing;
  }

  const refreshPromise = (async () => {
    logger.info("xero.token_refresh_needed", {
      orgId,
      expiresAt: expiresAt.toISOString(),
    });

    try {
      return await refreshXeroTokens(
        supabase,
        connection.refresh_token,
        connection.id,
        orgId,
        connection.company_id
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // invalid_grant means the refresh token is dead (expired or revoked)
      if (errorMessage.includes("400") || errorMessage.includes("invalid_grant")) {
        // Mark connection as expired in DB
        await supabase
          .from("accounting_connections")
          .update({ status: "expired" })
          .eq("id", connection.id);

        logger.warn("xero.connection_expired", {
          orgId,
          connectionId: connection.id,
        });

        throw new ConnectionExpiredError("xero", orgId);
      }

      // Other errors — mark as error status
      await supabase
        .from("accounting_connections")
        .update({ status: "error" })
        .eq("id", connection.id);

      logger.error("xero.token_refresh_failed", {
        orgId,
        connectionId: connection.id,
        errorType: errorMessage,
      });

      throw new Error(
        "Unable to connect to Xero. Please try again in a few minutes."
      );
    }
  })();

  refreshLocks.set(orgId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshLocks.delete(orgId);
  }
}
```

- [ ] **Step 4: Run status check tests**

Run: `npx vitest run lib/xero/auth.test.ts -t "status checks"`
Expected: PASS.

- [ ] **Step 5: Write failing test — `invalid_grant` sets status to 'expired'**

Add to the status checks describe block:

```typescript
  it("sets status='expired' and throws ConnectionExpiredError on invalid_grant", async () => {
    const expiredTokenConnection = {
      id: "conn-1",
      status: "active",
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired
      company_id: "tenant-1",
      company_name: "Acme",
    };

    const mockStatusUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: expiredTokenConnection, error: null }),
              }),
            }),
          }),
        }),
        update: mockStatusUpdate,
      }),
    };

    // Mock Xero returning 400 (invalid_grant)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    }) as typeof fetch;

    const { getValidAccessToken } = await import("./auth");
    const { ConnectionExpiredError } = await import("@/lib/accounting/types");

    await expect(getValidAccessToken(mockSupabase as never, "org-1")).rejects.toThrow(
      ConnectionExpiredError
    );

    // Verify status was set to 'expired'
    const [updateData] = mockStatusUpdate.mock.calls[0];
    expect(updateData.status).toBe("expired");
  });
```

- [ ] **Step 6: Run test**

Run: `npx vitest run lib/xero/auth.test.ts -t "invalid_grant"`
Expected: PASS.

- [ ] **Step 7: Write test — tokens never appear in log calls**

Add a new describe block:

```typescript
describe("token security", () => {
  it("never logs token values", async () => {
    const { logger } = await import("@/lib/utils/logger");
    const allCalls = [
      ...(logger.info as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(logger.error as ReturnType<typeof vi.fn>).mock.calls,
    ];

    for (const call of allCalls) {
      const serialized = JSON.stringify(call);
      // Check no raw or encrypted tokens leaked
      expect(serialized).not.toContain("raw_access");
      expect(serialized).not.toContain("raw_refresh");
      expect(serialized).not.toContain("new_access");
      expect(serialized).not.toContain("new_refresh");
      expect(serialized).not.toContain("old_access");
      expect(serialized).not.toContain("old_refresh");
      expect(serialized).not.toContain("enc_");
    }
  });
});
```

- [ ] **Step 8: Run test**

Run: `npx vitest run lib/xero/auth.test.ts -t "token security"`
Expected: PASS.

- [ ] **Step 9: Update existing concurrency coalescing test mock**

The existing `getValidAccessToken` concurrency test (in the `describe("getValidAccessToken", ...)` block) mocks `from().upsert()` because the old implementation called `storeConnection()`. The new implementation calls `refreshXeroTokens()` which uses `.update().eq()`. Update the mock in that test from:

```typescript
        upsert: vi.fn().mockResolvedValue({ error: null }),
```

To:

```typescript
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
```

Do the same for the "returns decrypted token without refreshing" test's mock if it includes `upsert`.

- [ ] **Step 10: Run all Xero auth tests**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: All tests PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat: enhance getValidAccessToken with status checks and invalid_grant handling (DOC-55)"
```

---

## Task 7: Update QBO Auth for Parity

**Files:**
- Modify: `lib/quickbooks/auth.ts`

- [ ] **Step 1: Add `refresh_token_expires_at` to QBO `storeConnection`**

Add constant near the top of `lib/quickbooks/auth.ts` (after `TOKEN_EXPIRY_BUFFER_MS`):

```typescript
// QBO refresh tokens expire after ~101 days
const QBO_REFRESH_TOKEN_LIFETIME_MS = 101 * 24 * 60 * 60 * 1000;
```

Update the upsert data object in `storeConnection` (around line 161-173) to include:

```typescript
      status: "active",
      refresh_token_expires_at: new Date(
        Date.now() + QBO_REFRESH_TOKEN_LIFETIME_MS
      ).toISOString(),
```

- [ ] **Step 2: Update QBO `getValidAccessToken` to use `ConnectionExpiredError`**

Add import at top:

```typescript
import { ConnectionExpiredError } from "@/lib/accounting/types";
```

In the refresh failure catch block (around line 251-257), replace:

```typescript
    } catch {
      logger.error("qbo.token_refresh_failed_disconnect", { orgId });
      throw new Error(
        "QuickBooks connection expired. Please reconnect in Settings."
      );
    }
```

With:

```typescript
    } catch {
      logger.error("qbo.token_refresh_failed_disconnect", { orgId });
      throw new ConnectionExpiredError("quickbooks", orgId);
    }
```

- [ ] **Step 3: Update the refresh success path to write `refresh_token_expires_at`**

The refresh path calls `storeConnection` (line 267) which now includes `refresh_token_expires_at` from step 1. No additional change needed — just verify the call chain.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Run existing QBO tests**

Run: `npx vitest run lib/quickbooks/`
Expected: All tests PASS. (If any tests assert on the exact error message "QuickBooks connection expired", update them to check for `ConnectionExpiredError` instead.)

- [ ] **Step 6: Commit**

```bash
git add lib/quickbooks/auth.ts
git commit -m "feat: QBO auth parity — add refresh_token_expires_at and ConnectionExpiredError (DOC-55)"
```

---

## Task 8: Connection Health Banner Component

**Files:**
- Create: `components/settings/ConnectionHealthBanner.tsx`

- [ ] **Step 1: Create the `ConnectionHealthBanner` component**

```typescript
"use client";

interface ConnectionHealthBannerProps {
  provider: "quickbooks" | "xero";
  status?: "active" | "expired" | "error";
  refreshTokenExpiresAt?: string | null;
  companyName?: string;
}

export function ConnectionHealthBanner({
  provider,
  status,
  refreshTokenExpiresAt,
  companyName,
}: ConnectionHealthBannerProps) {
  const providerLabel = provider === "quickbooks" ? "QuickBooks" : "Xero";
  const connectUrl =
    provider === "quickbooks" ? "/api/quickbooks/connect" : "/api/xero/connect";

  // Expired or error status — show reconnect prompt
  if (status === "expired" || status === "error") {
    const message =
      status === "expired"
        ? `Your ${providerLabel} connection has expired.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect to continue syncing."}`
        : `There's a problem with your ${providerLabel} connection.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect."}`;

    return (
      <div className="rounded-brand-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-center justify-between gap-3">
        <p className="font-body text-[13px] text-[#991B1B]">{message}</p>
        <a
          href={connectUrl}
          className="px-3 py-1.5 rounded-brand-md bg-[#DC2626] text-white text-[13px] font-medium hover:bg-[#B91C1C] transition-colors inline-block"
        >
          Reconnect
        </a>
      </div>
    );
  }

  // Check refresh token expiry
  if (refreshTokenExpiresAt) {
    const expiresAt = new Date(refreshTokenExpiresAt);
    const now = new Date();
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Past expiry but status not yet updated — treat as expired
    if (daysRemaining <= 0) {
      const expiredMessage = `Your ${providerLabel} connection has expired.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect to continue syncing."}`;
      return (
        <div className="rounded-brand-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-body text-[13px] text-[#991B1B]">{expiredMessage}</p>
          <a
            href={connectUrl}
            className="px-3 py-1.5 rounded-brand-md bg-[#DC2626] text-white text-[13px] font-medium hover:bg-[#B91C1C] transition-colors inline-block"
          >
            Reconnect
          </a>
        </div>
      );
    }

    if (daysRemaining <= 7) {
      return (
        <div className="rounded-brand-md bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-body text-[13px] text-[#92400E]">
            Your {providerLabel} connection expires in {daysRemaining} day
            {daysRemaining !== 1 ? "s" : ""}. Reconnect now to avoid
            interruption.
          </p>
          <a
            href={connectUrl}
            className="px-3 py-1.5 rounded-brand-md bg-[#D97706] text-white text-[13px] font-medium hover:bg-[#B45309] transition-colors inline-block"
          >
            Reconnect
          </a>
        </div>
      );
    }
  }

  // No warning needed
  return null;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/ConnectionHealthBanner.tsx
git commit -m "feat: add ConnectionHealthBanner component for expiry warnings (DOC-55)"
```

---

## Task 9: Wire Health Check into Settings Page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update Settings page to pass health data and render banner**

Add import at the top:

```typescript
import { ConnectionHealthBanner } from "@/components/settings/ConnectionHealthBanner";
```

Update the connection data object (around lines 46-63) to include status and expiry:

```typescript
  let connectionData: {
    connected: boolean;
    provider?: "quickbooks" | "xero";
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
    status?: "active" | "expired" | "error";
    refreshTokenExpiresAt?: string | null;
  } = { connected: false };

  if (orgId) {
    const adminSupabase = createAdminClient();
    const connection = await getOrgConnection(adminSupabase, orgId);
    if (connection) {
      connectionData = {
        connected: true,
        provider: connection.provider,
        companyId: connection.companyId,
        companyName: connection.companyName ?? undefined,
        connectedAt: connection.connectedAt,
        status: connection.status,
        refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
      };
    }
  }
```

Update the JSX — add the health banner above the `QBOConnectionCard` in the Connections section (around line 109):

```tsx
      {/* Connections Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Connections
        </p>
        {connectionData.connected && connectionData.provider && (
          <div className="mb-3">
            <ConnectionHealthBanner
              provider={connectionData.provider}
              status={connectionData.status}
              refreshTokenExpiresAt={connectionData.refreshTokenExpiresAt}
              companyName={connectionData.companyName}
            />
          </div>
        )}
        <QBOConnectionCard connection={qboConnection} />
      </div>
```

Also update the `qboConnection` object to use `connectionData`:

```typescript
  const qboConnection = {
    connected: connectionData.connected,
    companyId: connectionData.companyId,
    companyName: connectionData.companyName,
    connectedAt: connectionData.connectedAt,
  };
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx"
git commit -m "feat: wire connection health banner into Settings page (DOC-55)"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Verify no `any` types in new code**

Search for `any` in modified files:

```bash
grep -n ': any' lib/xero/auth.ts lib/accounting/types.ts lib/accounting/connection.ts components/settings/ConnectionHealthBanner.tsx
```

Expected: No matches.

- [ ] **Step 6: Verify no `console.log` in production code**

```bash
grep -n 'console.log' lib/xero/auth.ts lib/accounting/types.ts components/settings/ConnectionHealthBanner.tsx
```

Expected: No matches.

- [ ] **Step 7: Deliver status report**

```
STATUS REPORT - DOC-55: Xero Token Management

1. FILES CHANGED
   supabase/migrations/20260320000000_add_connection_status.sql - New migration adding status + refresh_token_expires_at columns
   lib/accounting/types.ts - Added ConnectionExpiredError class, updated AccountingConnectionInfo
   lib/accounting/types.test.ts - Tests for ConnectionExpiredError
   lib/accounting/connection.ts - Updated select query and mapping for new fields
   lib/xero/types.ts - Added new columns to AccountingConnectionRow
   lib/xero/auth.ts - Added refreshXeroTokens(), enhanced getValidAccessToken() with status checks/retries
   lib/xero/auth.test.ts - Added tests for refresh, retries, status checks, invalid_grant, token security
   lib/quickbooks/types.ts - Added new columns to AccountingConnectionRow
   lib/quickbooks/auth.ts - Added refresh_token_expires_at writes, ConnectionExpiredError usage
   components/settings/ConnectionHealthBanner.tsx - New component for expiry warning / reconnect prompt
   app/(dashboard)/settings/page.tsx - Wired health banner into settings page

2. DEPENDENCIES
   None added.

3. ACCEPTANCE CRITERIA CHECK
   ✅ Access tokens auto-refresh transparently before expiry
   ✅ Refresh token expiry detected and surfaces reconnection prompt
   ✅ New tokens encrypted before storage (AES-256-GCM)
   ✅ Token refresh failure logs structured error and marks connection status
   ✅ 5-minute expiry buffer prevents race conditions
   ✅ Settings page shows warning when refresh token within 7 days of expiry
   ✅ Unit tests cover all specified scenarios

4. SELF-REVIEW
   a) DB write retry uses simple setTimeout — adequate for MVP, no external dependency
   b) No TypeScript errors suppressed
   c) Multi-instance lock limitation documented in spec, invalid_grant handler serves as safety net
   d) QBO auth.ts touched for parity (refresh_token_expires_at + ConnectionExpiredError)
   e) Confidence: High

5. NEXT STEPS
   - DOC-54 landing: Update OAuth callback to set refresh_token_expires_at on initial connect
   - Wire refreshTokens into Xero adapter's AccountingProvider interface
   - Route-level integration (API routes calling getValidXeroTokens before Xero API calls)
```
