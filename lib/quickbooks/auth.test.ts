import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("@/lib/utils/encryption", () => ({
  encrypt: (v: string) => `enc_${v}`,
  decrypt: (v: string) => v.replace(/^enc_/, ""),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Track refresh calls to verify coalescing
let refreshCallCount = 0;
const MOCK_TOKEN_RESPONSE = {
  access_token: "new_access",
  refresh_token: "new_refresh",
  expires_in: 3600,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// We need to mock the fetch used by refreshAccessToken
const originalFetch = globalThis.fetch;

describe("getValidAccessToken", () => {
  beforeEach(() => {
    refreshCallCount = 0;
    vi.restoreAllMocks();

    // Mock env vars for getConfig()
    process.env.QBO_CLIENT_ID = "test_client_id";
    process.env.QBO_CLIENT_SECRET = "test_client_secret";
    process.env.QBO_REDIRECT_URI = "http://localhost:3000/api/auth/callback/quickbooks";

    // Mock fetch for Intuit token endpoint
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("oauth.platform.intuit.com")) {
        refreshCallCount++;
        // Simulate network latency to expose race conditions
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          json: async () => MOCK_TOKEN_RESPONSE,
        };
      }
      return originalFetch(url);
    }) as typeof fetch;
  });

  it("coalesces concurrent token refreshes into a single Intuit API call", async () => {
    const expiredConnection = {
      access_token: "enc_old_access",
      refresh_token: "enc_old_refresh",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired 1 min ago
      company_id: "12345",
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

    // Import after mocks are set up
    const { getValidAccessToken } = await import("./auth");

    // Fire 5 concurrent calls (simulating batch extraction)
    const results = await Promise.all([
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
      getValidAccessToken(mockSupabase as never, "org-1"),
    ]);

    // All 5 should get valid tokens
    for (const result of results) {
      expect(result.accessToken).toBe("new_access");
      expect(result.companyId).toBe("12345");
    }

    // Only ONE refresh call should have been made to Intuit
    expect(refreshCallCount).toBe(1);
  });
});
