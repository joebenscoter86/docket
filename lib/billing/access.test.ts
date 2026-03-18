// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkInvoiceAccess } from "./access";

// Mock the admin client
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

function mockUser(overrides: {
  is_design_partner?: boolean;
  subscription_status?: string;
  trial_ends_at?: string | null;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      trial_ends_at: overrides.trial_ends_at ?? null,
    },
    error: null,
  });
}

describe("checkInvoiceAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows design partners regardless of subscription or trial", async () => {
    mockUser({ is_design_partner: true, subscription_status: "inactive", trial_ends_at: null });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "design_partner" });
  });

  it("allows users with active subscription", async () => {
    mockUser({ subscription_status: "active" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "active_subscription" });
  });

  it("allows users within trial period", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockUser({ trial_ends_at: futureDate });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "trial" });
  });

  it("denies users with expired trial", async () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    mockUser({ trial_ends_at: pastDate });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: true,
    });
  });

  it("denies users with null trial_ends_at (pre-migration users)", async () => {
    mockUser({ trial_ends_at: null });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: false,
    });
  });

  it("denies users with past_due subscription", async () => {
    mockUser({ subscription_status: "past_due" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "past_due",
      trialExpired: false,
    });
  });

  it("denies users with cancelled subscription", async () => {
    mockUser({ subscription_status: "cancelled" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "cancelled",
      trialExpired: false,
    });
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(checkInvoiceAccess("bad-id")).rejects.toThrow("Failed to look up user for access check");
  });
});
