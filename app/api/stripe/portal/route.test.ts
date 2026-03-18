// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/helpers", () => ({
  createBillingPortalUrl: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

import { POST } from "./route";
import { createBillingPortalUrl } from "@/lib/stripe/helpers";

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when user has no stripe_customer_id", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: null },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns portal URL on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    (createBillingPortalUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://billing.stripe.com/session/bps_test_123"
    );

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.portalUrl).toBe("https://billing.stripe.com/session/bps_test_123");
  });
});
