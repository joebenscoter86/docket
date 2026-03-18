// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock stripe before importing helpers
vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

const mockUserSelect = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockUserSelect,
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: mockUserUpdate,
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  }),
}));

import { getOrCreateStripeCustomer } from "./helpers";
import { stripe } from "@/lib/stripe/client";

describe("getOrCreateStripeCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing stripe_customer_id when already set", async () => {
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: "cus_existing123" },
      error: null,
    });

    const result = await getOrCreateStripeCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_existing123");
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it("creates a new Stripe customer and stores the ID when none exists", async () => {
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: null },
      error: null,
    });
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cus_new456",
    });
    mockUserUpdate.mockResolvedValue({ data: { stripe_customer_id: "cus_new456" }, error: null });

    const result = await getOrCreateStripeCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_new456");
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: "test@example.com",
      metadata: { userId: "user-1" },
    });
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    await expect(
      getOrCreateStripeCustomer("user-1", "test@example.com")
    ).rejects.toThrow("Failed to look up user");
  });
});
