import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserTierFeatures } from "./tier-context";

// Shared mock chain that the implementation will receive
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockAdminClient = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));

function mockUser(overrides: {
  subscription_status?: string;
  subscription_tier?: string | null;
  is_design_partner?: boolean;
  trial_invoices_used?: number;
}) {
  mockSingle.mockResolvedValue({
    data: {
      subscription_status: overrides.subscription_status ?? "inactive",
      subscription_tier: overrides.subscription_tier ?? null,
      is_design_partner: overrides.is_design_partner ?? false,
      trial_invoices_used: overrides.trial_invoices_used ?? 0,
    },
    error: null,
  });
}

describe("getUserTierFeatures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire the chain after clearAllMocks resets return values
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it("returns Pro features for design partners", async () => {
    mockUser({ is_design_partner: true, subscription_tier: null });
    const result = await getUserTierFeatures("user-1");
    expect(result.features.batch_upload).toBe(true);
    expect(result.features.bill_to_check).toBe(true);
    expect(result.isDesignPartner).toBe(true);
    expect(result.isTrial).toBe(false);
  });

  it("returns Pro features for trial users", async () => {
    mockUser({ trial_invoices_used: 3 });
    const result = await getUserTierFeatures("user-1");
    expect(result.features.batch_upload).toBe(true);
    expect(result.features.bill_to_check).toBe(true);
    expect(result.isTrial).toBe(true);
  });

  it("returns Starter features for Starter subscribers", async () => {
    mockUser({ subscription_status: "active", subscription_tier: "starter" });
    const result = await getUserTierFeatures("user-1");
    expect(result.features.batch_upload).toBe(false);
    expect(result.features.bill_to_check).toBe(false);
    expect(result.tier).toBe("starter");
  });

  it("returns Pro features for Pro subscribers", async () => {
    mockUser({ subscription_status: "active", subscription_tier: "pro" });
    const result = await getUserTierFeatures("user-1");
    expect(result.features.batch_upload).toBe(true);
    expect(result.features.bill_to_check).toBe(true);
    expect(result.tier).toBe("pro");
  });

  it("returns Growth features for Growth subscribers", async () => {
    mockUser({ subscription_status: "active", subscription_tier: "growth" });
    const result = await getUserTierFeatures("user-1");
    expect(result.features.batch_upload).toBe(true);
    expect(result.features.bill_to_check).toBe(true);
    expect(result.tier).toBe("growth");
  });
});
