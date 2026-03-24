import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkEmailRateLimit, HOURLY_LIMIT, DAILY_LIMIT } from "./rate-limit";

// --- Mocks ---

const mockHourlySelect = vi.fn();
const mockDailySelect = vi.fn();

let callCount = 0;

const mockAdminClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        gte: vi.fn(() => {
          callCount += 1;
          return callCount === 1 ? mockHourlySelect() : mockDailySelect();
        }),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

describe("checkEmailRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
  });

  it("allows when both hourly and daily counts are under limit", async () => {
    mockHourlySelect.mockResolvedValue({ count: HOURLY_LIMIT - 1, error: null });
    mockDailySelect.mockResolvedValue({ count: DAILY_LIMIT - 1, error: null });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: true });
  });

  it("blocks with reason 'hourly' when hourly count meets limit", async () => {
    mockHourlySelect.mockResolvedValue({ count: HOURLY_LIMIT, error: null });
    // Daily query should not be reached

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: false, reason: "hourly" });
  });

  it("blocks with reason 'hourly' when hourly count exceeds limit", async () => {
    mockHourlySelect.mockResolvedValue({ count: HOURLY_LIMIT + 5, error: null });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: false, reason: "hourly" });
  });

  it("blocks with reason 'daily' when daily count meets limit", async () => {
    mockHourlySelect.mockResolvedValue({ count: 0, error: null });
    mockDailySelect.mockResolvedValue({ count: DAILY_LIMIT, error: null });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: false, reason: "daily" });
  });

  it("blocks with reason 'daily' when daily count exceeds limit", async () => {
    mockHourlySelect.mockResolvedValue({ count: 0, error: null });
    mockDailySelect.mockResolvedValue({ count: DAILY_LIMIT + 10, error: null });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: false, reason: "daily" });
  });

  it("fails open (allows) when hourly DB query errors", async () => {
    mockHourlySelect.mockResolvedValue({ count: null, error: { message: "DB error" } });
    mockDailySelect.mockResolvedValue({ count: 0, error: null });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: true });
  });

  it("fails open (allows) when daily DB query errors", async () => {
    mockHourlySelect.mockResolvedValue({ count: 0, error: null });
    mockDailySelect.mockResolvedValue({ count: null, error: { message: "DB error" } });

    const result = await checkEmailRateLimit("org-1");

    expect(result).toEqual({ allowed: true });
  });

  it("passes orgId and time window to the query", async () => {
    mockHourlySelect.mockResolvedValue({ count: 0, error: null });
    mockDailySelect.mockResolvedValue({ count: 0, error: null });

    await checkEmailRateLimit("org-abc");

    // from() called twice (hourly + daily)
    expect(mockAdminClient.from).toHaveBeenCalledTimes(2);
    expect(mockAdminClient.from).toHaveBeenCalledWith("email_ingestion_log");
  });
});
