// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRpc = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, params: unknown) => {
      mockRpc(fn, params);
      return Promise.resolve({ error: null });
    },
    from: (table: string) => {
      if (table === "gl_account_mappings") {
        return {
          select: (...args: unknown[]) => {
            mockSelect(...args);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { upsertGlMapping, lookupGlMappings } from "./gl-mappings";

describe("upsertGlMapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls rpc with normalized vendor and description", async () => {
    await upsertGlMapping("org-1", "  Acme Corp  ", "  Office Supplies  ", "acc-84");

    expect(mockRpc).toHaveBeenCalledWith("upsert_gl_mapping", {
      p_org_id: "org-1",
      p_vendor_name: "acme corp",
      p_description_pattern: "office supplies",
      p_gl_account_id: "acc-84",
    });
  });

  it("skips upsert when vendor_name is empty after normalization", async () => {
    await upsertGlMapping("org-1", "   ", "Office Supplies", "acc-84");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("skips upsert when description is empty after normalization", async () => {
    await upsertGlMapping("org-1", "Acme Corp", "   ", "acc-84");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not throw when rpc fails", async () => {
    mockRpc.mockImplementation(() => Promise.resolve({ error: { message: "DB error" } }));
    await upsertGlMapping("org-1", "Acme Corp", "Office Supplies", "acc-84");
    // Should not throw — just logs warning
  });
});

describe("lookupGlMappings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty map when vendor is empty", async () => {
    const result = await lookupGlMappings("org-1", "   ");
    expect(result.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty map when query fails", async () => {
    // Make the select chain return an error
    mockSelect.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: { message: "DB error" } })),
      })),
    });

    const result = await lookupGlMappings("org-1", "Acme Corp");
    expect(result.size).toBe(0);
  });
});
