# DOC-54: Xero OAuth2 Connect Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Xero OAuth2+PKCE connect/callback/disconnect routes mirroring the existing QBO OAuth pattern.

**Architecture:** Parallel auth modules — `lib/xero/auth.ts` is standalone, mirrors `lib/quickbooks/auth.ts`. Shared utilities (encryption, logger, errors) are reused. No changes to QBO code or the provider abstraction layer.

**Tech Stack:** Next.js 14 API routes, Supabase (auth + DB), Node.js crypto (PKCE + state generation), AES-256-GCM encryption (existing `lib/utils/encryption.ts`), Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-03-20-doc-54-xero-oauth-connect-design.md`

**Reference files:**
- QBO connect route: `app/api/quickbooks/connect/route.ts`
- QBO callback: `app/api/auth/callback/quickbooks/route.ts`
- QBO disconnect: `app/api/quickbooks/disconnect/route.ts`
- QBO auth helpers: `lib/quickbooks/auth.ts`
- QBO types: `lib/quickbooks/types.ts`
- Encryption: `lib/utils/encryption.ts`
- Error helpers: `lib/utils/errors.ts`
- Sandbox findings: `scripts/sandbox/sandbox-notes.md` (Xero section)
- QBO auth tests: `lib/quickbooks/auth.test.ts`

---

### Task 1: Xero Types (`lib/xero/types.ts`)

**Files:**
- Create: `lib/xero/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/xero/types.ts

/**
 * Token response shape from Xero's token endpoint.
 * Confirmed in DOC-53 sandbox validation.
 */
export interface XeroTokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number; // 1800 (30 min)
  token_type: "Bearer";
  refresh_token: string;
  scope: string;
}

/**
 * Internal representation after token exchange.
 * Mirrors QBOTokens in lib/quickbooks/types.ts.
 */
export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Tenant object from GET https://api.xero.com/connections.
 * After OAuth, this endpoint returns the list of orgs the user authorized.
 * We take the first tenant.
 */
export interface XeroTenant {
  id: string; // UUID
  authEventId: string;
  tenantId: string; // UUID — stored as company_id in accounting_connections
  tenantType: string; // "ORGANISATION"
  tenantName: string; // stored as company_name
  createdDateUtc: string;
  updatedDateUtc: string;
}

/**
 * Database row shape for accounting_connections table.
 * Re-declared here to avoid cross-provider import from lib/quickbooks/types.
 * Keeps parallel module structure clean (Xero auth doesn't depend on QBO types).
 */
export interface AccountingConnectionRow {
  id: string;
  org_id: string;
  provider: "quickbooks" | "xero";
  access_token: string; // encrypted
  refresh_token: string; // encrypted
  token_expires_at: string;
  company_id: string;
  connected_at: string;
  company_name?: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors related to the new file)

- [ ] **Step 3: Commit**

```bash
git add lib/xero/types.ts
git commit -m "feat(xero): add OAuth types for token response and tenant (DOC-54)"
```

---

### Task 2: PKCE and State Generation (`lib/xero/auth.ts` — Part 1)

**Files:**
- Create: `lib/xero/auth.ts`
- Create: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing tests for PKCE and state generation**

```typescript
// lib/xero/auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePKCE, generateState } from "./auth";

// All vi.mock() calls are hoisted to file top by Vitest — place them here
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: (v: string) => `enc_${v}`,
  decrypt: (v: string) => v.replace(/^enc_/, ""),
}));

describe("generatePKCE", () => {
  it("returns a code_verifier of exactly 43 characters", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toHaveLength(43);
  });

  it("returns a base64url-encoded code_verifier (no +, /, =)", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a base64url-encoded code_challenge", () => {
    const { codeChallenge } = generatePKCE();
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique verifiers on each call", () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("challenge is SHA256 of verifier in base64url", async () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    // Manually compute expected challenge
    const { createHash } = await import("crypto");
    const expected = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    expect(codeChallenge).toBe(expected);
  });
});

describe("generateState", () => {
  it("returns a 64-character hex string", () => {
    const state = generateState();
    expect(state).toHaveLength(64);
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique state on each call", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: FAIL — `generatePKCE` and `generateState` not found

- [ ] **Step 3: Implement generatePKCE and generateState**

Write the initial `lib/xero/auth.ts` with just these two functions plus the config helper and constants:

```typescript
// lib/xero/auth.ts
import { randomBytes, createHash } from "crypto";
import { encrypt, decrypt } from "@/lib/utils/encryption";
import { logger } from "@/lib/utils/logger";
import type { XeroTokenResponse, XeroTokens, XeroTenant } from "./types";
import type { AccountingConnectionRow } from "./types";

// ─── Configuration ───

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation";
const SCOPES =
  "openid offline_access accounting.invoices accounting.contacts accounting.settings accounting.attachments";

// Buffer before actual expiry to avoid edge-case failures (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function getConfig() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri =
    process.env.XERO_REDIRECT_URI ||
    "http://localhost:3000/api/auth/callback/xero";

  if (!clientId || !clientSecret) {
    throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET");
  }

  return { clientId, clientSecret, redirectUri };
}

// ─── PKCE ───

/**
 * Generate a PKCE code_verifier and code_challenge pair.
 * Verifier: 32 random bytes → base64url (43 chars).
 * Challenge: SHA256(verifier) → base64url.
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

// ─── OAuth2 Flow ───

/**
 * Generate a cryptographic random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}
```

Note: The file will be extended in subsequent tasks. Only export `generatePKCE` and `generateState` for now.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat(xero): add PKCE and state generation with tests (DOC-54)"
```

---

### Task 3: Authorization URL and Token Exchange (`lib/xero/auth.ts` — Part 2)

**Files:**
- Modify: `lib/xero/auth.ts`
- Modify: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing tests for getAuthorizationUrl and exchangeCodeForTokens**

Append to `lib/xero/auth.test.ts`:

```typescript
// Append to lib/xero/auth.test.ts — imports and mocks already at top of file.
// Add getAuthorizationUrl to the import from "./auth".

describe("getAuthorizationUrl", () => {
  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";
  });

  it("returns a URL pointing to Xero login", () => {
    const url = getAuthorizationUrl("test_state", "test_challenge");
    expect(url).toContain("https://login.xero.com/identity/connect/authorize");
  });

  it("includes all required OAuth params", () => {
    const url = getAuthorizationUrl("abc123", "challenge456");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("test_client_id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/xero"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("abc123");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge456");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("includes the correct granular scopes", () => {
    const url = getAuthorizationUrl("state", "challenge");
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope")!;
    expect(scope).toContain("openid");
    expect(scope).toContain("offline_access");
    expect(scope).toContain("accounting.invoices");
    expect(scope).toContain("accounting.contacts");
    expect(scope).toContain("accounting.settings");
    expect(scope).toContain("accounting.attachments");
    // Must NOT contain the deprecated scope
    expect(scope).not.toContain("accounting.transactions");
  });
});
```

Import `getAuthorizationUrl` from `"./auth"` alongside the existing imports.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: FAIL — `getAuthorizationUrl` is not exported

- [ ] **Step 3: Implement getAuthorizationUrl**

Add to `lib/xero/auth.ts`:

```typescript
/**
 * Build the Xero authorization URL for OAuth2+PKCE.
 */
export function getAuthorizationUrl(
  state: string,
  codeChallenge: string
): string {
  const { clientId, redirectUri } = getConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${XERO_AUTH_URL}?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: PASS (all tests including new ones)

- [ ] **Step 5: Write failing tests for exchangeCodeForTokens and getXeroTenantId**

Append to `lib/xero/auth.test.ts`:

```typescript
// Append to lib/xero/auth.test.ts — mocks already at top of file.
// Add exchangeCodeForTokens and getXeroTenantId to the import from "./auth".

describe("exchangeCodeForTokens", () => {
  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";
    vi.restoreAllMocks();
  });

  it("exchanges code and verifier for tokens via Basic auth", async () => {
    const mockResponse = {
      id_token: "id_tok",
      access_token: "access_tok",
      expires_in: 1800,
      token_type: "Bearer",
      refresh_token: "refresh_tok",
      scope: "openid offline_access",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as typeof fetch;

    const tokens = await exchangeCodeForTokens("auth_code", "verifier_123");

    expect(tokens.accessToken).toBe("access_tok");
    expect(tokens.refreshToken).toBe("refresh_tok");
    expect(tokens.expiresIn).toBe(1800);

    // Verify Basic auth header was sent
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers;
    const expectedBasic = Buffer.from("test_client_id:test_client_secret").toString("base64");
    expect(headers["Authorization"]).toBe(`Basic ${expectedBasic}`);

    // Verify code_verifier was included in the body
    const body = fetchCall[1].body as URLSearchParams;
    expect(body.get("code_verifier")).toBe("verifier_123");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad request",
    }) as typeof fetch;

    await expect(
      exchangeCodeForTokens("bad_code", "verifier")
    ).rejects.toThrow("Token exchange failed: 400");
  });
});

describe("getXeroTenantId", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tenantId and tenantName from /connections", async () => {
    const mockTenants = [
      {
        id: "conn-1",
        authEventId: "auth-1",
        tenantId: "9a073d07-da83-4eb5-8c54-a5611d714379",
        tenantType: "ORGANISATION",
        tenantName: "Demo Company (US)",
        createdDateUtc: "2026-03-20T00:00:00Z",
        updatedDateUtc: "2026-03-20T00:00:00Z",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTenants,
    }) as typeof fetch;

    const result = await getXeroTenantId("access_token_123");

    expect(result.tenantId).toBe("9a073d07-da83-4eb5-8c54-a5611d714379");
    expect(result.tenantName).toBe("Demo Company (US)");

    // Verify Bearer token was sent
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers["Authorization"]).toBe("Bearer access_token_123");
  });

  it("throws when connections array is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof fetch;

    await expect(getXeroTenantId("token")).rejects.toThrow(
      "No Xero organizations found"
    );
  });
});
```

Import `exchangeCodeForTokens` and `getXeroTenantId` from `"./auth"`.

- [ ] **Step 6: Run tests to verify the new ones fail**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 7: Implement exchangeCodeForTokens and getXeroTenantId**

Add to `lib/xero/auth.ts`:

```typescript
/**
 * Exchange an authorization code + PKCE verifier for access + refresh tokens.
 * Uses Basic auth header (base64(client_id:client_secret)) per Xero's spec.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<XeroTokens> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.exchange_code_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as XeroTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch the Xero tenant ID from the /connections endpoint.
 * Returns the first tenant's ID and name. Throws if no tenants found.
 */
export async function getXeroTenantId(
  accessToken: string
): Promise<{ tenantId: string; tenantName: string }> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.connections_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Failed to fetch Xero connections: ${response.status}`);
  }

  const tenants = (await response.json()) as XeroTenant[];

  if (tenants.length === 0) {
    throw new Error(
      "No Xero organizations found. Please authorize at least one organization."
    );
  }

  return {
    tenantId: tenants[0].tenantId,
    tenantName: tenants[0].tenantName,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat(xero): add auth URL builder, token exchange, and tenant fetch (DOC-54)"
```

---

### Task 4: Token Storage, Refresh, and Disconnect (`lib/xero/auth.ts` — Part 3)

**Files:**
- Modify: `lib/xero/auth.ts`
- Modify: `lib/xero/auth.test.ts`

- [ ] **Step 1: Write failing test for storeConnection**

Append to `lib/xero/auth.test.ts`:

```typescript
describe("storeConnection", () => {
  it("encrypts tokens and upserts to accounting_connections with provider xero", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    const tokens: XeroTokens = {
      accessToken: "access_123",
      refreshToken: "refresh_456",
      expiresIn: 1800,
    };

    await storeConnection(
      mockSupabase as never,
      "org-1",
      tokens,
      "tenant-uuid-123",
      "Demo Company"
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("accounting_connections");
    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.provider).toBe("xero");
    expect(upsertArg.org_id).toBe("org-1");
    expect(upsertArg.company_id).toBe("tenant-uuid-123");
    expect(upsertArg.company_name).toBe("Demo Company");
    // Tokens should be encrypted (mock encrypt prepends "enc_")
    expect(upsertArg.access_token).toBe("enc_access_123");
    expect(upsertArg.refresh_token).toBe("enc_refresh_456");
    // Upsert should use onConflict
    expect(mockUpsert.mock.calls[0][1]).toEqual({
      onConflict: "org_id,provider",
    });
  });
});
```

Import `storeConnection` and `XeroTokens` type from `"./auth"` and `"./types"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: FAIL — `storeConnection` not exported

- [ ] **Step 3: Implement storeConnection, loadConnection, isConnected**

Add to `lib/xero/auth.ts`:

```typescript
/**
 * Store an encrypted Xero connection for an org.
 * Upserts on (org_id, provider): if a connection already exists, tokens are replaced.
 */
export async function storeConnection(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  tokens: XeroTokens,
  tenantId: string,
  tenantName?: string
): Promise<void> {
  const encryptedAccess = encrypt(tokens.accessToken);
  const encryptedRefresh = encrypt(tokens.refreshToken);

  const { error } = await supabase.from("accounting_connections").upsert(
    {
      org_id: orgId,
      provider: "xero",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: new Date(
        Date.now() + tokens.expiresIn * 1000
      ).toISOString(),
      company_id: tenantId,
      company_name: tenantName ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" }
  );

  if (error) {
    logger.error("xero.store_connection_failed", {
      orgId,
      error: error.message,
    });
    throw new Error(`Failed to store Xero connection: ${error.message}`);
  }

  logger.info("xero.connection_stored", { orgId, tenantId });
}

/**
 * Load the raw connection row for an org (returns null if not connected).
 */
export async function loadConnection(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<AccountingConnectionRow | null> {
  const { data, error } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "xero")
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as AccountingConnectionRow;
}

/**
 * Check if an org has an active Xero connection.
 */
export async function isConnected(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<boolean> {
  const connection = await loadConnection(supabase, orgId);
  return connection !== null;
}
```

- [ ] **Step 4: Run tests to verify storeConnection passes**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for refresh token coalescing**

Append to `lib/xero/auth.test.ts`. This mirrors the QBO pattern from `lib/quickbooks/auth.test.ts`:

```typescript
describe("getValidAccessToken", () => {
  let refreshCallCount = 0;

  beforeEach(() => {
    refreshCallCount = 0;
    vi.restoreAllMocks();
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("identity.xero.com/connect/token")) {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          json: async () => ({
            access_token: "new_access",
            refresh_token: "new_refresh",
            expires_in: 1800,
            token_type: "Bearer",
            id_token: "id",
            scope: "openid",
          }),
        };
      }
      return { ok: true, json: async () => [] };
    }) as typeof fetch;
  });

  it("coalesces concurrent token refreshes into a single Xero API call", async () => {
    const expiredConnection = {
      access_token: "enc_old_access",
      refresh_token: "enc_old_refresh",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      company_id: "tenant-123",
      company_name: "Test Co",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: expiredConnection,
                  error: null,
                }),
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");

    const results = await Promise.all([
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
    ]);

    for (const result of results) {
      expect(result.accessToken).toBe("new_access");
      expect(result.tenantId).toBe("tenant-123");
    }

    // Only ONE refresh call to Xero
    expect(refreshCallCount).toBe(1);
  });

  it("returns decrypted token without refreshing when not expired", async () => {
    const validConnection = {
      access_token: "enc_valid_access",
      refresh_token: "enc_valid_refresh",
      token_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(), // 20 min from now
      company_id: "tenant-123",
      company_name: "Test Co",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: validConnection,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");
    const result = await getValidAccessToken(mockSupabase as never, "org-2");

    expect(result.accessToken).toBe("valid_access");
    expect(result.tenantId).toBe("tenant-123");
    // No refresh call should have been made
    expect(refreshCallCount).toBe(0);
  });
});

describe("loadConnection", () => {
  it("returns connection row when found", async () => {
    const row = {
      id: "conn-1",
      org_id: "org-1",
      provider: "xero",
      access_token: "enc_tok",
      refresh_token: "enc_ref",
      token_expires_at: "2026-03-20T00:00:00Z",
      company_id: "tenant-1",
      company_name: "Test",
      connected_at: "2026-03-20T00:00:00Z",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { loadConnection } = await import("./auth");
    const result = await loadConnection(mockSupabase as never, "org-1");
    expect(result).toEqual(row);
  });

  it("returns null when no connection exists", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
              }),
            }),
          }),
        }),
      }),
    };

    const { loadConnection } = await import("./auth");
    const result = await loadConnection(mockSupabase as never, "org-1");
    expect(result).toBeNull();
  });
});

describe("disconnect", () => {
  it("calls Xero revocation endpoint and deletes the connection row", async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const connection = {
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: "2026-03-20T00:00:00Z",
      company_id: "tenant-1",
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "accounting_connections") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: connection, error: null }),
                  }),
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      }),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    process.env.XERO_CLIENT_ID = "test_id";
    process.env.XERO_CLIENT_SECRET = "test_secret";

    const { disconnect } = await import("./auth");
    await disconnect(mockSupabase as never, "org-1");

    // Verify revocation was called with form-urlencoded
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(fetchCall[0])).toContain("identity.xero.com/connect/revocation");
    expect(fetchCall[1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    // Verify DB delete was called
    expect(mockDelete).toHaveBeenCalled();
  });

  it("succeeds even if revocation fetch throws", async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const connection = {
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: "2026-03-20T00:00:00Z",
      company_id: "tenant-1",
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "accounting_connections") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: connection, error: null }),
                  }),
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      }),
    };

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as typeof fetch;
    process.env.XERO_CLIENT_ID = "test_id";
    process.env.XERO_CLIENT_SECRET = "test_secret";

    const { disconnect } = await import("./auth");
    // Should NOT throw even though revocation failed
    await expect(disconnect(mockSupabase as never, "org-1")).resolves.toBeUndefined();

    // DB delete should still have been called
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: FAIL — `getValidAccessToken` not exported or doesn't exist

- [ ] **Step 7: Implement refreshAccessToken, getValidAccessToken, and disconnect**

Add to `lib/xero/auth.ts`:

```typescript
/**
 * Per-org token refresh lock. Coalesces concurrent refresh calls.
 * Critical for Xero: refresh tokens rotate on use, so concurrent
 * refreshes with the same token would fail after the first one.
 */
const refreshLocks = new Map<
  string,
  Promise<{ accessToken: string; tenantId: string }>
>();

/**
 * Refresh an expired access token using the refresh token.
 * Returns the full token response (caller must store the new refresh token).
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<XeroTokenResponse> {
  const { clientId, clientSecret } = getConfig();

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.refresh_token_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return (await response.json()) as XeroTokenResponse;
}

/**
 * Get a valid (non-expired) access token for an org.
 * Auto-refreshes if the current token is expired or about to expire.
 * Concurrent callers for the same org coalesce into a single refresh call.
 */
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

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // If token is still valid (with 5-min buffer), decrypt and return
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

    const decryptedRefresh = decrypt(connection.refresh_token);

    let tokenResponse: XeroTokenResponse;
    try {
      tokenResponse = await refreshAccessToken(decryptedRefresh);
    } catch {
      logger.error("xero.token_refresh_failed_disconnect", { orgId });
      throw new Error(
        "Xero connection expired. Please reconnect in Settings."
      );
    }

    // Store the NEW tokens (refresh token rotates — old one is now invalid)
    const newTokens: XeroTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };

    await storeConnection(
      supabase,
      orgId,
      newTokens,
      connection.company_id,
      connection.company_name ?? undefined
    );

    logger.info("xero.token_refreshed", { orgId });

    return {
      accessToken: newTokens.accessToken,
      tenantId: connection.company_id,
    };
  })();

  refreshLocks.set(orgId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshLocks.delete(orgId);
  }
}

/**
 * Disconnect Xero — revoke tokens and delete the connection row.
 * Revocation uses application/x-www-form-urlencoded per RFC 7009
 * (different from QBO which uses JSON body).
 */
export async function disconnect(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<void> {
  const connection = await loadConnection(supabase, orgId);

  if (connection) {
    // Best-effort revoke at Xero (fire-and-forget)
    try {
      const decryptedRefresh = decrypt(connection.refresh_token);

      await fetch(XERO_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          token: decryptedRefresh,
        }),
      });
    } catch {
      // Revocation failure is non-critical — token will expire anyway
      logger.warn("xero.revoke_failed", { orgId });
    }

    // Delete the connection row
    await supabase
      .from("accounting_connections")
      .delete()
      .eq("org_id", orgId)
      .eq("provider", "xero");
  }

  logger.info("xero.disconnected", { orgId });
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `npx vitest run lib/xero/auth.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Run full test suite to check for regressions**

Run: `npm run test`
Expected: PASS — no regressions in QBO or other tests

- [ ] **Step 10: Commit**

```bash
git add lib/xero/auth.ts lib/xero/auth.test.ts
git commit -m "feat(xero): add token storage, refresh with coalescing, and disconnect (DOC-54)"
```

---

### Task 5: Connect Route (`app/api/xero/connect/route.ts`)

**Files:**
- Create: `app/api/xero/connect/route.ts`

- [ ] **Step 1: Create the connect route**

```typescript
// app/api/xero/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateState,
  generatePKCE,
  getAuthorizationUrl,
} from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";
import { authError, internalError } from "@/lib/utils/errors";

/**
 * GET /api/xero/connect
 *
 * Initiates the Xero OAuth2+PKCE flow. Generates state + PKCE pair,
 * stores them in an httpOnly cookie, and redirects to Xero's authorization page.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify the user is authenticated
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError("You must be logged in to connect Xero.");
    }

    // Generate PKCE pair and CSRF state
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    const authUrl = getAuthorizationUrl(state, codeChallenge);

    const response = NextResponse.redirect(new URL(authUrl));

    // Store state, verifier, and optional returnTo in a single cookie
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
    const cookiePayload = JSON.stringify({
      state,
      codeVerifier,
      ...(returnTo && ALLOWED_RETURN_PATHS.includes(returnTo) && { returnTo }),
    });

    response.cookies.set("xero_oauth_pkce", cookiePayload, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    logger.info("xero.oauth_initiated", {
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error) {
    logger.error("xero.oauth_initiate_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to initiate Xero connection.");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/xero/connect/route.ts
git commit -m "feat(xero): add /api/xero/connect route for OAuth initiation (DOC-54)"
```

---

### Task 6: Callback Route (`app/api/auth/callback/xero/route.ts`)

**Files:**
- Create: `app/api/auth/callback/xero/route.ts`

- [ ] **Step 1: Create the callback route**

```typescript
// app/api/auth/callback/xero/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForTokens,
  getXeroTenantId,
  storeConnection,
} from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/auth/callback/xero
 *
 * OAuth2 callback handler. Xero redirects here after the user authorizes.
 * Validates the CSRF state, exchanges the code + PKCE verifier for tokens,
 * fetches the tenant ID, encrypts and stores the connection.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = request.nextUrl.origin;

  // Parse the PKCE cookie
  const pkceCookie = request.cookies.get("xero_oauth_pkce")?.value;
  let savedState: string | undefined;
  let codeVerifier: string | undefined;
  let returnTo = "/settings";

  if (pkceCookie) {
    try {
      const parsed = JSON.parse(pkceCookie);
      savedState = parsed.state;
      codeVerifier = parsed.codeVerifier;
      if (parsed.returnTo) {
        const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
        if (ALLOWED_RETURN_PATHS.includes(parsed.returnTo)) {
          returnTo = parsed.returnTo;
        }
      }
    } catch {
      // Cookie parse failed — treat as missing
    }
  }

  // Helper to redirect with error and clear cookie
  const errorRedirect = (message: string) => {
    const response = NextResponse.redirect(
      `${baseUrl}${returnTo}?xero_error=${encodeURIComponent(message)}`
    );
    response.cookies.delete("xero_oauth_pkce");
    return response;
  };

  // Handle user denying authorization
  if (error) {
    logger.warn("xero.oauth_denied", { error });
    return errorRedirect("Xero connection was not authorized.");
  }

  // Validate required params
  if (!code || !state) {
    logger.error("xero.oauth_callback_missing_params", {
      hasCode: String(!!code),
      hasState: String(!!state),
    });
    return errorRedirect("Connection failed. Missing required parameters.");
  }

  // CSRF validation
  if (!savedState || savedState !== state) {
    logger.error("xero.oauth_csrf_mismatch", {
      hasSavedState: String(!!savedState),
      stateMatch: String(savedState === state),
    });
    return errorRedirect("Connection failed. Please try again.");
  }

  if (!codeVerifier) {
    logger.error("xero.oauth_missing_verifier");
    return errorRedirect("Connection failed. Please try again.");
  }

  try {
    // Verify user is authenticated
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login?redirect=${returnTo}`);
    }

    // Get the user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      logger.error("xero.oauth_no_org", { userId: user.id });
      return errorRedirect(
        "No organization found. Please contact support."
      );
    }

    // Exchange code + verifier for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    // Fetch tenant ID from /connections
    const { tenantId, tenantName } = await getXeroTenantId(tokens.accessToken);

    // Store encrypted tokens
    const adminSupabase = createAdminClient();
    await storeConnection(
      adminSupabase,
      membership.org_id,
      tokens,
      tenantId,
      tenantName
    );

    logger.info("xero.oauth_complete", {
      userId: user.id,
      orgId: membership.org_id,
      tenantId,
      durationMs: Date.now() - startTime,
    });

    // Redirect with success, clear cookie
    const response = NextResponse.redirect(
      `${baseUrl}${returnTo}?xero_success=${encodeURIComponent("Xero connected successfully!")}`
    );
    response.cookies.delete("xero_oauth_pkce");
    return response;
  } catch (err) {
    logger.error("xero.oauth_callback_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return errorRedirect("Failed to connect Xero. Please try again.");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/callback/xero/route.ts
git commit -m "feat(xero): add OAuth callback route with PKCE + CSRF validation (DOC-54)"
```

---

### Task 7: Disconnect Route (`app/api/xero/disconnect/route.ts`)

**Files:**
- Create: `app/api/xero/disconnect/route.ts`

- [ ] **Step 1: Create the disconnect route**

```typescript
// app/api/xero/disconnect/route.ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnect } from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * POST /api/xero/disconnect
 *
 * Disconnects Xero: revokes tokens (best-effort) and deletes the connection row.
 */
export async function POST() {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    const adminSupabase = createAdminClient();
    await disconnect(adminSupabase, membership.org_id);

    logger.info("xero.disconnect_requested", {
      userId: user.id,
      orgId: membership.org_id,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({ disconnected: true });
  } catch (error) {
    logger.error("xero.disconnect_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to disconnect Xero.");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/xero/disconnect/route.ts
git commit -m "feat(xero): add /api/xero/disconnect route (DOC-54)"
```

---

### Task 8: Environment Variables and Final Verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example with XERO_REDIRECT_URI**

The Xero section in `.env.example` already has `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, and `XERO_TENANT_ID`. Add `XERO_REDIRECT_URI` and a comment clarifying that `XERO_TENANT_ID` is populated dynamically (not set manually):

Replace the existing Xero section:
```
# Xero
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
# Xero tenant ID (retrieved via /connections endpoint after OAuth)
# Each Xero organization has a unique tenant ID (UUID format)
XERO_TENANT_ID=
# Xero access/refresh tokens (populated by scripts/sandbox/xero-auth.ts — not committed)
# XERO_ACCESS_TOKEN=
# XERO_REFRESH_TOKEN=
```

With:
```
# Xero OAuth2
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
# Must match the redirect URI registered in Xero Developer Portal.
# Local dev: http://localhost:3000/api/auth/callback/xero
# Production: https://dockett.app/api/auth/callback/xero
XERO_REDIRECT_URI=http://localhost:3000/api/auth/callback/xero
# Xero tenant ID — set only for sandbox scripts. In production, this is
# fetched dynamically via the /connections endpoint after OAuth.
XERO_TENANT_ID=
# Xero access/refresh tokens (populated by scripts/sandbox/xero-auth.ts — not committed)
# XERO_ACCESS_TOKEN=
# XERO_REFRESH_TOKEN=
```

- [ ] **Step 2: Run full verification**

Run each in sequence:
```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected: All PASS with zero errors, zero warnings.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example with Xero redirect URI (DOC-54)"
```
