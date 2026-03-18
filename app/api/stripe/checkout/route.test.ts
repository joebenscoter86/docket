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

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when user is a design partner", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: true, subscription_status: null },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
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

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("creates checkout session and returns sessionUrl on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    (getOrCreateStripeCustomer as ReturnType<typeof vi.fn>).mockResolvedValue("cus_123");
    (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://checkout.stripe.com/session/cs_test_123",
    });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.sessionUrl).toBe("https://checkout.stripe.com/session/cs_test_123");
    expect(getOrCreateStripeCustomer).toHaveBeenCalledWith("user-1", "test@example.com");
  });
});
