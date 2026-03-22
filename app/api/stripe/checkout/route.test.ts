// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/stripe/helpers", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

vi.mock("@/lib/billing/tiers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/tiers")>();
  return {
    ...actual,
    validatePriceId: vi.fn((priceId: string) => {
      if (priceId === "price_starter_monthly") {
        return { tier: "starter", interval: "monthly" };
      }
      if (priceId === "price_pro_monthly") {
        return { tier: "pro", interval: "monthly" };
      }
      return null;
    }),
  };
});

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === "org_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: mockMembershipSelect,
              })),
            })),
          })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockUserSelect,
            })),
          })),
        };
      }
      return {};
    }),
  }),
}));

import { POST } from "./route";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/helpers";

const fakeUser = { id: "user-1", email: "test@example.com" };

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipSelect.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: false, subscription_status: null },
      error: null,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ priceId: "price_starter_monthly" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when priceId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when priceId is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const res = await POST(makeRequest({ priceId: "price_invalid" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toBe("Invalid price ID.");
  });

  it("returns 400 when user is a design partner", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: true, subscription_status: null },
      error: null,
    });

    const res = await POST(makeRequest({ priceId: "price_starter_monthly" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when subscription is already active", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: false, subscription_status: "active" },
      error: null,
    });

    const res = await POST(makeRequest({ priceId: "price_starter_monthly" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("creates checkout session with correct tier metadata", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    (getOrCreateStripeCustomer as ReturnType<typeof vi.fn>).mockResolvedValue("cus_123");
    (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://checkout.stripe.com/session/cs_test_123",
    });

    const res = await POST(makeRequest({ priceId: "price_pro_monthly" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.sessionUrl).toBe("https://checkout.stripe.com/session/cs_test_123");
    expect(getOrCreateStripeCustomer).toHaveBeenCalledWith("user-1", "test@example.com");

    const createCall = (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.line_items[0].price).toBe("price_pro_monthly");
    expect(createCall.subscription_data.metadata.tier).toBe("pro");
    expect(createCall.subscription_data.metadata.billing_period).toBe("monthly");
  });
});
