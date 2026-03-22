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
  trial_invoices_used?: number;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      trial_invoices_used: overrides.trial_invoices_used ?? 0,
    },
    error: null,
  });
}

describe("checkInvoiceAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows design partners regardless of subscription or trial", async () => {
    mockUser({ is_design_partner: true, subscription_status: "inactive" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "design_partner" });
  });

  it("allows users with active subscription", async () => {
    mockUser({ subscription_status: "active" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "active_subscription" });
  });

  it("allows trial users with fewer than 10 invoices used", async () => {
    mockUser({ trial_invoices_used: 5 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "trial" });
  });

  it("allows trial users with 0 invoices used", async () => {
    mockUser({ trial_invoices_used: 0 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "trial" });
  });

  it("denies users who have exhausted trial (10 invoices)", async () => {
    mockUser({ trial_invoices_used: 10 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExhausted: true,
    });
  });

  it("denies users who have exceeded trial limit", async () => {
    mockUser({ trial_invoices_used: 15 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExhausted: true,
    });
  });

  it("denies users with past_due subscription and exhausted trial", async () => {
    mockUser({ subscription_status: "past_due", trial_invoices_used: 10 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "past_due",
      trialExhausted: true,
    });
  });

  it("denies users with cancelled subscription and exhausted trial", async () => {
    mockUser({ subscription_status: "cancelled", trial_invoices_used: 10 });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "cancelled",
      trialExhausted: true,
    });
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(checkInvoiceAccess("bad-id")).rejects.toThrow("Failed to look up user for access check");
  });
});
