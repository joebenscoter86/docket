// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { incrementTrialInvoice } from "./trial";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
  }),
}));

describe("incrementTrialInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns new count on successful increment", async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: true, newCount: 3 });
    expect(mockRpc).toHaveBeenCalledWith("increment_trial_invoice", {
      p_user_id: "user-1",
    });
  });

  it("returns trialExhausted when function returns -1 (limit reached)", async () => {
    mockRpc.mockResolvedValue({ data: -1, error: null });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: false, reason: "trial_exhausted" });
  });

  it("returns error on RPC failure (fail-open)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB down" } });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: true, newCount: -1, failedOpen: true });
  });
});
