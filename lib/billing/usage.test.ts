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
  billing_period_start?: string | null;
  billing_period_end?: string | null;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      billing_period_start: overrides.billing_period_start ?? null,
      billing_period_end: overrides.billing_period_end ?? null,
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

  it("returns calendar month period for design partners", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(42);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(42);
    expect(result.limit).toBe(100);
    expect(result.percentUsed).toBeCloseTo(42);
    expect(result.isDesignPartner).toBe(true);
    expect(result.periodStart).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("returns Stripe billing period for active subscribers with cached dates", async () => {
    mockUser({
      subscription_status: "active",
      billing_period_start: "2026-03-10T00:00:00Z",
      billing_period_end: "2026-04-10T00:00:00Z",
    });
    mockInvoiceCountResult(15);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(15);
    expect(result.limit).toBe(null);
    expect(result.percentUsed).toBe(null);
    expect(result.isDesignPartner).toBe(false);
    expect(result.periodStart).toEqual(new Date("2026-03-10T00:00:00Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-10T00:00:00Z"));
  });

  it("falls back to calendar month when billing period not cached", async () => {
    mockUser({ subscription_status: "active" });
    mockInvoiceCountResult(5);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.periodStart).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("returns calendar month for trial users", async () => {
    mockUser({ subscription_status: "inactive" });
    mockInvoiceCountResult(3);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(3);
    expect(result.limit).toBe(null);
    expect(result.isDesignPartner).toBe(false);
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

  it("blocks when design partner at limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(100);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("monthly_limit_reached");
    }
  });

  it("blocks when design partner over limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(105);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
  });

  it("always allows active subscribers (unlimited)", async () => {
    mockUser({ subscription_status: "active" });
    mockInvoiceCountResult(9999);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });

  it("always allows trial users (no hard limit)", async () => {
    mockUser({ subscription_status: "inactive" });
    mockInvoiceCountResult(500);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });
});
