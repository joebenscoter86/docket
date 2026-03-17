import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/quickbooks/api", () => ({
  createVendor: vi.fn(),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    qboErrors: Array<{ Message: string; Detail: string; code: string; element?: string }>;
    faultType: string;
    constructor(statusCode: number, errors: Array<{ Message: string; Detail: string; code: string; element?: string }>, faultType: string) {
      super(errors[0]?.Message ?? "Unknown");
      this.statusCode = statusCode;
      this.qboErrors = errors;
      this.faultType = faultType;
    }
    get errorCode() { return this.qboErrors[0]?.code ?? "unknown"; }
    get element() { return this.qboErrors[0]?.element; }
  },
  getVendorOptions: vi.fn(),
}));

import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVendor, QBOApiError } from "@/lib/quickbooks/api";

function mockAuthUser(userId: string | null, orgId: string | null) {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: orgId ? { org_id: orgId } : null,
            }),
          }),
        }),
      }),
    }),
  };
  (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({});
  return supabase;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/quickbooks/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/quickbooks/vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a vendor and returns VendorOption", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: "99",
      label: "Acme Inc",
    });

    const res = await POST(makeRequest({ displayName: "Acme Inc", address: "123 Main St" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ value: "99", label: "Acme Inc" });
    expect(createVendor).toHaveBeenCalledWith({}, "org-1", "Acme Inc", "123 Main St");
  });

  it("returns 400 when displayName is missing", async () => {
    mockAuthUser("user-1", "org-1");
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when displayName is empty string", async () => {
    mockAuthUser("user-1", "org-1");
    const res = await POST(makeRequest({ displayName: "  " }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthUser(null, null);
    const res = await POST(makeRequest({ displayName: "Acme" }));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.code).toBe("AUTH_ERROR");
  });

  it("returns 409 when QBO reports duplicate vendor (error code 6240)", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(400, [{ Message: "Duplicate", Detail: "Duplicate Name", code: "6240", element: "DisplayName" }], "ValidationFault")
    );
    const res = await POST(makeRequest({ displayName: "Existing Vendor" }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("returns 401 when QBO token is expired", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(401, [{ Message: "Auth failure", Detail: "Token expired", code: "100" }], "AuthenticationFault")
    );
    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.code).toBe("AUTH_ERROR");
  });

  it("returns 422 when no QBO connection exists", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("No QuickBooks connection found. Connect QuickBooks in Settings first.")
    );
    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();
    expect(res.status).toBe(422);
    expect(json.code).toBe("UNPROCESSABLE");
  });

  it("returns 500 for other QBO errors", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(500, [{ Message: "Server error", Detail: "Internal", code: "500" }], "SystemFault")
    );
    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR");
  });
});
