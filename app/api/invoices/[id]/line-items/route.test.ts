// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockInvoiceSelect = vi.fn();
const mockExtractedDataSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockInvoiceSelect,
          })),
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockExtractedDataSelect,
            })),
          })),
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockCreateLineItem = vi.fn();
vi.mock("@/lib/extraction/data", () => ({
  createLineItem: (...args: unknown[]) => mockCreateLineItem(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "./route";

function makeRequest(invoiceId: string, body: Record<string, unknown>) {
  return {
    request: new Request(`http://localhost/api/invoices/${invoiceId}/line-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = { id: "inv-1", org_id: "org-1" };
const fakeLineItem = {
  id: "li-new",
  description: null,
  quantity: null,
  unit_price: null,
  amount: null,
  gl_account_id: null,
  sort_order: 2,
};

describe("POST /api/invoices/[id]/line-items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest("inv-1", { extracted_data_id: "ed-1" });
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when extracted_data_id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

    const { request, params } = makeRequest("inv-1", {});
    const res = await POST(request, { params });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when invoice not found (RLS)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeRequest("inv-999", { extracted_data_id: "ed-1" });
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when extracted_data_id does not belong to invoice", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeRequest("inv-1", { extracted_data_id: "ed-wrong" });
    const res = await POST(request, { params });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with new line item on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: { id: "ed-1" }, error: null });
    mockCreateLineItem.mockResolvedValue(fakeLineItem);

    const { request, params } = makeRequest("inv-1", { extracted_data_id: "ed-1" });
    const res = await POST(request, { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe("li-new");
    expect(body.data.sort_order).toBe(2);
  });

  it("returns 500 when createLineItem fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: { id: "ed-1" }, error: null });
    mockCreateLineItem.mockResolvedValue(null);

    const { request, params } = makeRequest("inv-1", { extracted_data_id: "ed-1" });
    const res = await POST(request, { params });
    expect(res.status).toBe(500);
  });
});
