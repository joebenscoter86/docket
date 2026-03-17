// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockInvoiceSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockInvoiceSelect,
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

// Admin client mock (status update only — runExtraction is fully mocked)
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

// runExtraction mock
const mockRunExtraction = vi.fn();
vi.mock("@/lib/extraction/run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

// Logger mock
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Helpers
function makeRequest(invoiceId = "inv-1") {
  return {
    request: new Request(`http://localhost/api/invoices/${invoiceId}/retry`, {
      method: "POST",
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
  status: "error",
  file_path: "org-1/inv-1/invoice.pdf",
  file_type: "application/pdf",
  retry_count: 1,
};

const fakeExtractionResult = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-03-01",
    dueDate: "2026-03-31",
    subtotal: 100.0,
    taxAmount: 10.0,
    totalAmount: 110.0,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [],
  },
  rawResponse: {},
  modelVersion: "claude-sonnet-4-6",
  durationMs: 3800,
};

describe("POST /api/invoices/[id]/retry", () => {
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
    mockInvoiceSelect.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when invoice is not in error status", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, status: "pending_review" },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.error).toContain("not in an error state");
  });

  it("returns 422 when max retries exhausted", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: { ...fakeInvoice, retry_count: 3 },
      error: null,
    });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("UNPROCESSABLE");
    expect(body.error).toContain("3 attempts");
    expect(body.error).toContain("manually");
  });

  it("returns 200 with extracted data on successful retry", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockRunExtraction.mockResolvedValue(fakeExtractionResult);

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      vendorName: "Acme Corp",
      totalAmount: 110.0,
    });
    expect(mockRunExtraction).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      orgId: "org-1",
      userId: "user-1",
      filePath: "org-1/inv-1/invoice.pdf",
      fileType: "application/pdf",
    });
  });

  it("returns 500 when extraction fails during retry", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockInvoiceSelect.mockResolvedValue({
      data: fakeInvoice,
      error: null,
    });
    mockRunExtraction.mockRejectedValue(
      new Error("Extraction timed out. Please retry.")
    );

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toContain("timed out");
  });
});
