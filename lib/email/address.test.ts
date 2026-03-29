import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateInboundAddress } from "./address";

describe("generateInboundAddress", () => {
  it("returns an address matching the expected format", () => {
    const address = generateInboundAddress();
    expect(address).toMatch(/^invoices-[a-z2-9]{10}@ingest\.dockett\.app$/);
  });

  it("generates unique addresses on successive calls", () => {
    const a = generateInboundAddress();
    const b = generateInboundAddress();
    expect(a).not.toBe(b);
  });

  it("uses only unambiguous characters (no 0, 1, l, o, i)", () => {
    for (let i = 0; i < 100; i++) {
      const address = generateInboundAddress();
      const id = address.split("-")[1].split("@")[0];
      expect(id).not.toMatch(/[01loi]/);
    }
  });

  it("generates 10-character IDs", () => {
    const address = generateInboundAddress();
    const id = address.split("-")[1].split("@")[0];
    expect(id).toHaveLength(10);
  });
});

// --- Tests for setCustomPrefix (requires Supabase mock) ---

// mockSingle is shared across both DB calls in setCustomPrefix.
// Each test queues responses in order: first call = select check, second call = update result.
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => {
  const chain = (): Record<string, unknown> => ({
    select: () => chain(),
    update: () => chain(),
    eq: () => chain(),
    single: mockSingle,
  });

  return {
    createAdminClient: () => ({
      from: () => chain(),
    }),
  };
});

describe("setCustomPrefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid prefix (too short)", async () => {
    const { setCustomPrefix } = await import("./address");
    const result = await setCustomPrefix("org-1", "ab");
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("at least 3"),
    });
  });

  it("rejects a reserved prefix", async () => {
    const { setCustomPrefix } = await import("./address");
    const result = await setCustomPrefix("org-1", "admin");
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("reserved"),
    });
  });

  it("returns conflict when address is already taken by another org", async () => {
    const { setCustomPrefix } = await import("./address");
    // select check finds another org with this address
    mockSingle.mockResolvedValueOnce({
      data: { id: "other-org" },
      error: null,
    });

    const result = await setCustomPrefix("org-1", "jdr");
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("already in use"),
      code: "CONFLICT",
    });
  });

  it("allows setting prefix that the same org already has", async () => {
    const { setCustomPrefix } = await import("./address");
    // select check finds the same org (re-setting same prefix)
    mockSingle
      .mockResolvedValueOnce({ data: { id: "org-1" }, error: null })
      .mockResolvedValueOnce({
        data: { inbound_email_address: "jdr@ingest.dockett.app" },
        error: null,
      });

    const result = await setCustomPrefix("org-1", "jdr");
    expect(result).toEqual({
      success: true,
      address: "jdr@ingest.dockett.app",
    });
  });

  it("updates the org address on success when no conflict", async () => {
    const { setCustomPrefix } = await import("./address");
    // select check: no existing org with this address
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
      .mockResolvedValueOnce({
        data: { inbound_email_address: "jdr@ingest.dockett.app" },
        error: null,
      });

    const result = await setCustomPrefix("org-1", "jdr");
    expect(result).toEqual({
      success: true,
      address: "jdr@ingest.dockett.app",
    });
  });

  it("handles unique constraint violation (race condition)", async () => {
    const { setCustomPrefix } = await import("./address");
    // select check: no existing org
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } })
      // update fails with unique constraint violation
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });

    const result = await setCustomPrefix("org-1", "jdr");
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining("already in use"),
      code: "CONFLICT",
    });
  });
});
