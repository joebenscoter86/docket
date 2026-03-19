// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: mockMembershipSelect,
        })),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

const mockIsConnected = vi.fn();
vi.mock("@/lib/quickbooks/auth", () => ({
  isConnected: (...args: unknown[]) => mockIsConnected(...args),
}));

const mockFetchPaymentAccounts = vi.fn();
vi.mock("@/lib/quickbooks/api", () => ({
  fetchPaymentAccounts: (...args: unknown[]) => mockFetchPaymentAccounts(...args),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    qboErrors: Array<{ Message: string; Detail: string; code: string }>;
    faultType: string;
    constructor(statusCode: number, errors: Array<{ Message: string; Detail: string; code: string }>, faultType: string) {
      super(errors[0]?.Message ?? "Unknown");
      this.statusCode = statusCode;
      this.qboErrors = errors;
      this.faultType = faultType;
    }
    get errorCode() { return this.qboErrors[0]?.code ?? "unknown"; }
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

// ─── Helpers ───

function makeRequest(type?: string | null) {
  const url = new URL("http://localhost:3000/api/quickbooks/payment-accounts");
  if (type !== null && type !== undefined) {
    url.searchParams.set("type", type);
  }
  return new NextRequest(url.toString());
}

const fakeAccounts = [
  { id: "101", name: "Business Checking", accountType: "Bank", currentBalance: 5000 },
  { id: "102", name: "Savings", accountType: "Bank", currentBalance: 10000 },
];

// ─── Tests ───

describe("GET /api/quickbooks/payment-accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockMembershipSelect.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockIsConnected.mockResolvedValue(true);
    mockFetchPaymentAccounts.mockResolvedValue(fakeAccounts);
  });

  it("returns 400 when type parameter is missing", async () => {
    const res = await GET(makeRequest(null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("type");
  });

  it("returns 400 when type parameter is invalid", async () => {
    const res = await GET(makeRequest("Checking"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 401 when no organization found", async () => {
    mockMembershipSelect.mockResolvedValue({ data: null, error: null });

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when no QBO connection", async () => {
    mockIsConnected.mockResolvedValue(false);

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("Connect QuickBooks");
  });

  it("returns Bank accounts on success", async () => {
    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accounts).toEqual(fakeAccounts);
    expect(mockFetchPaymentAccounts).toHaveBeenCalledWith({}, "org-1", "Bank");
  });

  it("returns CreditCard accounts on success", async () => {
    const ccAccounts = [
      { id: "201", name: "Business Visa", accountType: "Credit Card", currentBalance: -1500 },
    ];
    mockFetchPaymentAccounts.mockResolvedValue(ccAccounts);

    const res = await GET(makeRequest("CreditCard"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accounts).toEqual(ccAccounts);
    expect(mockFetchPaymentAccounts).toHaveBeenCalledWith({}, "org-1", "CreditCard");
  });

  it("returns empty array when no accounts exist", async () => {
    mockFetchPaymentAccounts.mockResolvedValue([]);

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accounts).toEqual([]);
  });

  it("returns 401 when QBO token is expired", async () => {
    const { QBOApiError } = await import("@/lib/quickbooks/api");
    mockFetchPaymentAccounts.mockRejectedValue(
      new QBOApiError(
        401,
        [{ Message: "Auth failure", Detail: "Token expired", code: "100" }],
        "AuthenticationFault"
      )
    );

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
    expect(body.error).toContain("expired");
  });

  it("returns 500 on unexpected QBO error", async () => {
    mockFetchPaymentAccounts.mockRejectedValue(new Error("Network timeout"));

    const res = await GET(makeRequest("Bank"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
