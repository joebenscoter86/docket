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

// ─── Task 3: getAuthorizationUrl ───

describe("getAuthorizationUrl", () => {
  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";
  });

  it("returns a URL pointing to the Xero login endpoint", async () => {
    const { getAuthorizationUrl } = await import("./auth");
    const url = getAuthorizationUrl("state123", "challenge456");
    expect(url).toContain("https://login.xero.com/identity/connect/authorize");
  });

  it("includes all required OAuth + PKCE params", async () => {
    const { getAuthorizationUrl } = await import("./auth");
    const url = getAuthorizationUrl("state_val", "challenge_val");
    const parsed = new URL(url);

    expect(parsed.searchParams.get("client_id")).toBe("test_client_id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/xero"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("state_val");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge_val");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("includes the correct granular scopes (not deprecated accounting.transactions)", async () => {
    const { getAuthorizationUrl } = await import("./auth");
    const url = getAuthorizationUrl("s", "c");
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") ?? "";

    expect(scope).toContain("accounting.invoices");
    expect(scope).toContain("accounting.contacts");
    expect(scope).toContain("offline_access");
    expect(scope).not.toContain("accounting.transactions");
  });
});

// ─── Task 3: exchangeCodeForTokens ───

describe("exchangeCodeForTokens", () => {
  const MOCK_TOKEN_RESPONSE = {
    id_token: "id_tok",
    access_token: "acc_tok",
    expires_in: 1800,
    token_type: "Bearer",
    refresh_token: "ref_tok",
    scope: "openid offline_access",
  };

  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_TOKEN_RESPONSE,
    }) as typeof fetch;
  });

  it("exchanges code + verifier for tokens via Basic auth", async () => {
    const { exchangeCodeForTokens } = await import("./auth");
    const tokens = await exchangeCodeForTokens("auth_code", "verifier_val");

    expect(tokens.accessToken).toBe("acc_tok");
    expect(tokens.refreshToken).toBe("ref_tok");
    expect(tokens.expiresIn).toBe(1800);

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // Basic auth header
    const expected = Buffer.from("test_client_id:test_client_secret").toString("base64");
    expect(init.headers["Authorization"]).toBe(`Basic ${expected}`);
    // Body contains code_verifier
    expect(init.body.toString()).toContain("code_verifier=verifier_val");
    expect(init.body.toString()).toContain("code=auth_code");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    }) as typeof fetch;

    const { exchangeCodeForTokens } = await import("./auth");
    await expect(exchangeCodeForTokens("bad_code", "verifier")).rejects.toThrow(
      "Token exchange failed: 400"
    );
  });
});

// ─── Task 3: getXeroTenantId ───

describe("getXeroTenantId", () => {
  it("returns tenantId and tenantName from /connections", async () => {
    const mockTenants = [
      {
        id: "conn-1",
        authEventId: "evt-1",
        tenantId: "tenant-uuid-1",
        tenantType: "ORGANISATION",
        tenantName: "Acme Ltd",
        createdDateUtc: "2026-01-01",
        updatedDateUtc: "2026-01-01",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTenants,
    }) as typeof fetch;

    const { getXeroTenantId } = await import("./auth");
    const result = await getXeroTenantId("access_tok");

    expect(result.tenantId).toBe("tenant-uuid-1");
    expect(result.tenantName).toBe("Acme Ltd");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.xero.com/connections");
    expect(init.headers["Authorization"]).toBe("Bearer access_tok");
  });

  it("throws when connections array is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof fetch;

    const { getXeroTenantId } = await import("./auth");
    await expect(getXeroTenantId("access_tok")).rejects.toThrow(
      "No Xero tenants found"
    );
  });
});

// ─── Task 4: storeConnection ───

describe("storeConnection", () => {
  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";
  });

  it("encrypts tokens and upserts with provider 'xero' and correct onConflict", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    const { storeConnection } = await import("./auth");
    await storeConnection(
      mockSupabase as never,
      "org-123",
      { accessToken: "raw_access", refreshToken: "raw_refresh", expiresIn: 1800 },
      "tenant-uuid-1",
      "Acme Ltd"
    );

    expect(mockUpsert).toHaveBeenCalledOnce();
    const [upsertData, upsertOpts] = mockUpsert.mock.calls[0];

    expect(upsertData.provider).toBe("xero");
    expect(upsertData.org_id).toBe("org-123");
    // Tokens should be encrypted (mock prepends "enc_")
    expect(upsertData.access_token).toBe("enc_raw_access");
    expect(upsertData.refresh_token).toBe("enc_raw_refresh");
    expect(upsertData.company_id).toBe("tenant-uuid-1");
    expect(upsertData.company_name).toBe("Acme Ltd");
    expect(upsertOpts.onConflict).toBe("org_id,provider");
  });
});

// ─── Task 4: loadConnection ───

describe("loadConnection", () => {
  it("returns the connection row when found", async () => {
    const mockRow = {
      id: "row-1",
      org_id: "org-123",
      provider: "xero",
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      company_id: "tenant-1",
      connected_at: new Date().toISOString(),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    const { loadConnection } = await import("./auth");
    const result = await loadConnection(mockSupabase as never, "org-123");
    expect(result).toEqual(mockRow);
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
    const result = await loadConnection(mockSupabase as never, "org-123");
    expect(result).toBeNull();
  });
});

// ─── Task 4: getValidAccessToken ───

describe("getValidAccessToken", () => {
  let refreshCallCount = 0;
  const MOCK_REFRESH_RESPONSE = {
    id_token: "id_tok",
    access_token: "new_access",
    expires_in: 1800,
    token_type: "Bearer",
    refresh_token: "new_refresh",
    scope: "openid offline_access",
  };

  beforeEach(() => {
    refreshCallCount = 0;
    vi.restoreAllMocks();

    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("identity.xero.com")) {
        refreshCallCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { ok: true, json: async () => MOCK_REFRESH_RESPONSE };
      }
      return { ok: true, json: async () => [] };
    }) as typeof fetch;
  });

  it("returns decrypted token without refreshing when not expired", async () => {
    const validConnection = {
      access_token: "enc_valid_access",
      refresh_token: "enc_valid_refresh",
      // Expires well in the future (TOKEN_EXPIRY_BUFFER_MS is 5 min)
      token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      company_id: "tenant-uuid-1",
      company_name: "Acme Ltd",
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: validConnection, error: null }),
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");
    const result = await getValidAccessToken(mockSupabase as never, "org-1");

    expect(result.accessToken).toBe("valid_access"); // decrypt strips "enc_"
    expect(result.tenantId).toBe("tenant-uuid-1");
    // No fetch calls — token was not refreshed
    expect(refreshCallCount).toBe(0);
  });

  it("coalesces concurrent token refreshes into a single Xero API call", async () => {
    const expiredConnection = {
      access_token: "enc_old_access",
      refresh_token: "enc_old_refresh",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired 1 min ago
      company_id: "tenant-uuid-1",
      company_name: "Acme Ltd",
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
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const { getValidAccessToken } = await import("./auth");

    // Fire 5 concurrent calls
    const results = await Promise.all([
      getValidAccessToken(mockSupabase as never, "org-2"),
      getValidAccessToken(mockSupabase as never, "org-2"),
      getValidAccessToken(mockSupabase as never, "org-2"),
      getValidAccessToken(mockSupabase as never, "org-2"),
      getValidAccessToken(mockSupabase as never, "org-2"),
    ]);

    for (const result of results) {
      expect(result.accessToken).toBe("new_access");
      expect(result.tenantId).toBe("tenant-uuid-1");
    }

    // Only ONE refresh call should have been made to Xero
    expect(refreshCallCount).toBe(1);
  });
});

// ─── Task 4: disconnect ───

describe("disconnect", () => {
  beforeEach(() => {
    process.env.XERO_CLIENT_ID = "test_client_id";
    process.env.XERO_CLIENT_SECRET = "test_client_secret";
    process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/xero";
  });

  it("calls revocation endpoint with form-urlencoded body and deletes the row", async () => {
    const mockConnection = {
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      company_id: "tenant-1",
      company_name: "Acme",
    };

    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockConnection, error: null }),
              }),
            }),
          }),
        }),
        delete: mockDelete,
      }),
    };

    let revokeUrl = "";
    let revokeInit: RequestInit = {};
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      revokeUrl = String(url);
      revokeInit = init;
      return { ok: true };
    }) as typeof fetch;

    const { disconnect } = await import("./auth");
    await disconnect(mockSupabase as never, "org-123");

    expect(revokeUrl).toBe("https://identity.xero.com/connect/revocation");
    expect(revokeInit.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(revokeInit.body?.toString()).toContain("token=refresh"); // decrypt("enc_refresh") = "refresh"
    expect(mockDelete).toHaveBeenCalled();
  });

  it("succeeds even if the revocation fetch throws", async () => {
    const mockConnection = {
      access_token: "enc_access",
      refresh_token: "enc_refresh",
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      company_id: "tenant-1",
      company_name: "Acme",
    };

    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockConnection, error: null }),
              }),
            }),
          }),
        }),
        delete: mockDelete,
      }),
    };

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as typeof fetch;

    const { disconnect } = await import("./auth");
    // Should not throw — revocation failure is fire-and-forget
    await expect(disconnect(mockSupabase as never, "org-123")).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalled();
  });
});
