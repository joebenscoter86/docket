// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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
            single: mockExtractedDataSelect,
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockAdminUpdate = vi.fn();
const mockAdminClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: mockAdminUpdate,
    })),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

function makeRequest(invoiceId = "inv-1") {
  return {
    request: new Request(`http://localhost/api/invoices/${invoiceId}/approve`, {
      method: "POST",
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
  status: "pending_review",
};

const fakeExtractedData = {
  id: "ed-1",
  invoice_id: "inv-1",
  vendor_name: "Acme Corp",
  total_amount: 110.0,
};

describe("POST /api/invoices/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpdate.mockResolvedValue({ error: null });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 404 when invoice is not found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when invoice is already approved", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "approved" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 409 when invoice is already synced", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "synced" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 400 when invoice status is not pending_review", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "extracting" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when extracted data does not exist", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.error).toContain("extracted data");
  });

  it("returns 400 when vendor_name is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: { ...fakeExtractedData, vendor_name: null },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("vendor_name");
  });

  it("returns 400 when total_amount is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: { ...fakeExtractedData, total_amount: null },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("total_amount");
  });

  it("returns 200 and updates status to approved on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("approved");
    expect(mockAdminClient.from).toHaveBeenCalledWith("invoices");
  });

  it("returns 500 when status update fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockExtractedDataSelect.mockResolvedValue({
      data: fakeExtractedData,
      error: null,
    });
    mockAdminUpdate.mockResolvedValue({ error: { message: "db error" } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
