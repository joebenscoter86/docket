import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/invoices/queries", () => ({
  validateListParams: vi.fn().mockReturnValue({
    status: "all",
    sort: "uploaded_at",
    direction: "desc",
    limit: 25,
  }),
  fetchInvoiceList: vi.fn().mockResolvedValue({
    invoices: [],
    nextCursor: null,
  }),
  fetchInvoiceCounts: vi.fn().mockResolvedValue({
    all: 0,
    pending_review: 0,
    approved: 0,
    synced: 0,
    error: 0,
  }),
}));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { fetchInvoiceList, fetchInvoiceCounts, validateListParams } from "@/lib/invoices/queries";

function createMockRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/invoices");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockAuth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: mockAuth,
    });
  });

  it("returns 401 when not authenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "not authenticated" },
        }),
      },
    });

    const response = await GET(createMockRequest() as never);
    expect(response.status).toBe(401);
  });

  it("returns invoices and counts on success", async () => {
    const mockInvoices = [{ id: "inv-1", file_name: "test.pdf", status: "pending_review" }];
    (fetchInvoiceList as ReturnType<typeof vi.fn>).mockResolvedValue({
      invoices: mockInvoices,
      nextCursor: null,
    });
    (fetchInvoiceCounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      all: 1,
      pending_review: 1,
      approved: 0,
      synced: 0,
      error: 0,
    });

    const response = await GET(createMockRequest() as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.invoices).toEqual(mockInvoices);
    expect(body.data.counts.all).toBe(1);
    expect(body.data.nextCursor).toBeNull();
  });

  it("passes search params to validateListParams", async () => {
    await GET(createMockRequest({ status: "approved", sort: "vendor_name" }) as never);
    expect(validateListParams).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", sort: "vendor_name" })
    );
  });
});
