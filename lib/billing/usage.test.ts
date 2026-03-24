// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUsageThisPeriod, checkUsageLimit } from "./usage";

// Mock admin client with chainable query builder
const mockInvoiceCount = vi.fn();
const mockUserSelect = vi.fn();

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
        };
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                not: vi.fn(() => mockInvoiceCount()),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  }),
}));

function mockUser(overrides: {
  is_design_partner?: boolean;
  subscription_status?: string;
  subscription_tier?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  trial_invoices_used?: number;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      subscription_tier: overrides.subscription_tier ?? null,
      billing_period_start: overrides.billing_period_start ?? null,
      billing_period_end: overrides.billing_period_end ?? null,
      trial_invoices_used: overrides.trial_invoices_used ?? 0,
    },
    error: null,
  });
}

function mockInvoiceCountResult(count: number) {
  mockInvoiceCount.mockResolvedValue({ count, error: null });
}

describe("getUsageThisPeriod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns design partner cap of 150", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(42);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(42);
    expect(result.limit).toBe(150);
    expect(result.percentUsed).toBeCloseTo(28);
    expect(result.isDesignPartner).toBe(true);
    expect(result.periodStart).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("returns tier-specific cap for active subscribers", async () => {
    mockUser({
      subscription_status: "active",
      subscription_tier: "starter",
      billing_period_start: "2026-03-10T00:00:00Z",
      billing_period_end: "2026-04-10T00:00:00Z",
    });
    mockInvoiceCountResult(15);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(15);
    expect(result.limit).toBe(75);
    expect(result.subscriptionTier).toBe("starter");
    expect(result.periodStart).toEqual(new Date("2026-03-10T00:00:00Z"));
  });

  it("returns pro cap (150) for pro subscribers", async () => {
    mockUser({
      subscription_status: "active",
      subscription_tier: "pro",
      billing_period_start: "2026-03-10T00:00:00Z",
      billing_period_end: "2026-04-10T00:00:00Z",
    });
    mockInvoiceCountResult(100);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.limit).toBe(150);
    expect(result.subscriptionTier).toBe("pro");
  });

  it("returns growth cap (500) for growth subscribers", async () => {
    mockUser({
      subscription_status: "active",
      subscription_tier: "growth",
      billing_period_start: "2026-03-10T00:00:00Z",
      billing_period_end: "2026-04-10T00:00:00Z",
    });
    mockInvoiceCountResult(300);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.limit).toBe(500);
    expect(result.subscriptionTier).toBe("growth");
  });

  it("returns trial info for new users", async () => {
    mockUser({ subscription_status: "inactive", trial_invoices_used: 3 });
    mockInvoiceCountResult(3);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.isTrial).toBe(true);
    expect(result.trialInvoicesUsed).toBe(3);
    expect(result.trialLimit).toBe(10);
    expect(result.limit).toBe(null);
  });

  it("marks trial as false when exhausted", async () => {
    mockUser({ subscription_status: "inactive", trial_invoices_used: 10 });
    mockInvoiceCountResult(10);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.isTrial).toBe(false);
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(getUsageThisPeriod("org-1", "bad-id")).rejects.toThrow();
  });
});

describe("checkUsageLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows when design partner under limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(80);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
    expect(result.usage.used).toBe(80);
  });

  it("blocks when design partner at limit (150)", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(150);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("monthly_limit_reached");
    }
  });

  it("blocks starter subscriber at cap (75)", async () => {
    mockUser({ subscription_status: "active", subscription_tier: "starter" });
    mockInvoiceCountResult(75);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("monthly_limit_reached");
    }
  });

  it("allows starter subscriber under cap", async () => {
    mockUser({ subscription_status: "active", subscription_tier: "starter" });
    mockInvoiceCountResult(50);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });

  it("blocks trial user at 10 invoices", async () => {
    mockUser({ subscription_status: "inactive", trial_invoices_used: 10 });
    mockInvoiceCountResult(10);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("trial_exhausted");
    }
  });

  it("allows trial user with fewer than 10 invoices", async () => {
    mockUser({ subscription_status: "inactive", trial_invoices_used: 5 });
    mockInvoiceCountResult(5);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });
});
