// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetUser = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockInvoiceSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockExtractedDataSelect,
          })),
        })),
      };
    }
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockInvoiceSelect,
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

const mockUpdateExtractedField = vi.fn();
const mockRecordCorrection = vi.fn();
vi.mock("@/lib/extraction/data", () => ({
  updateExtractedField: (...args: unknown[]) => mockUpdateExtractedField(...args),
  recordCorrection: (...args: unknown[]) => mockRecordCorrection(...args),
  EDITABLE_FIELDS: new Set([
    "vendor_name", "vendor_address", "invoice_number", "invoice_date",
    "due_date", "subtotal", "tax_amount", "total_amount", "currency", "payment_terms",
  ]),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "./route";

// --- Helpers ---
function makeRequest(invoiceId: string, body: Record<string, unknown>) {
  return {
    request: new Request(
      `http://localhost/api/invoices/${invoiceId}/extracted-data`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeExtractedData = {
  id: "ed-1",
  invoice_id: "inv-1",
  vendor_name: "Acme Corp",
  subtotal: 100,
  tax_amount: 10,
  total_amount: 110,
};

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
};

describe("PATCH /api/invoices/[id]/extracted-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateExtractedField.mockResolvedValue({ ...fakeExtractedData, vendor_name: "New Vendor" });
    mockRecordCorrection.mockResolvedValue(undefined);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "New Vendor" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when field is missing from body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const { request, params } = makeRequest("inv-1", { value: "New Vendor" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when field is not in allowlist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const { request, params } = makeRequest("inv-1", { field: "raw_ai_response", value: "hack" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("not editable");
  });

  it("returns 404 when extracted data not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "New Vendor" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 200 and saves field on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "New Vendor" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ field: "vendor_name", value: "New Vendor", saved: true });
  });

  it("records a correction when value differs from original", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "New Vendor" });
    await PATCH(request, { params });

    expect(mockRecordCorrection).toHaveBeenCalledWith(
      "inv-1",
      "org-1",
      "vendor_name",
      "Acme Corp",
      "New Vendor"
    );
  });

  it("does not record correction when value is unchanged", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    // vendor_name is already "Acme Corp" in fakeExtractedData
    mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "Acme Corp" });
    await PATCH(request, { params });

    expect(mockRecordCorrection).not.toHaveBeenCalled();
  });

  it("returns 500 when updateExtractedField returns null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockUpdateExtractedField.mockResolvedValue(null);

    const { request, params } = makeRequest("inv-1", { field: "vendor_name", value: "New Vendor" });
    const res = await PATCH(request, { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
