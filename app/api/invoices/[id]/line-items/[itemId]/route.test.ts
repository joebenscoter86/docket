// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockInvoiceSelect = vi.fn();
const mockLineItemSelect = vi.fn();

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
    if (table === "extracted_line_items") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockLineItemSelect,
          })),
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { vendor_name: "Acme Corp" }, error: null }),
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

const mockUpdateLineItemField = vi.fn();
const mockDeleteLineItem = vi.fn();
const mockRecordCorrection = vi.fn();
vi.mock("@/lib/extraction/data", () => ({
  updateLineItemField: (...args: unknown[]) => mockUpdateLineItemField(...args),
  deleteLineItem: (...args: unknown[]) => mockDeleteLineItem(...args),
  recordCorrection: (...args: unknown[]) => mockRecordCorrection(...args),
  LINE_ITEM_EDITABLE_FIELDS: new Set(["description", "quantity", "unit_price", "amount", "gl_account_id"]),
}));

const mockUpsertGlMapping = vi.fn();
vi.mock("@/lib/extraction/gl-mappings", () => ({
  upsertGlMapping: (...args: unknown[]) => mockUpsertGlMapping(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH, DELETE } from "./route";

function makePatchRequest(invoiceId: string, itemId: string, body: Record<string, unknown>) {
  return {
    request: new Request(
      `http://localhost/api/invoices/${invoiceId}/line-items/${itemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    params: Promise.resolve({ id: invoiceId, itemId }),
  };
}

function makeDeleteRequest(invoiceId: string, itemId: string) {
  return {
    request: new Request(
      `http://localhost/api/invoices/${invoiceId}/line-items/${itemId}`,
      { method: "DELETE" }
    ),
    params: Promise.resolve({ id: invoiceId, itemId }),
  };
}

const fakeInvoice = { id: "inv-1", org_id: "org-1" };
const fakeLineItem = {
  id: "li-1",
  description: "Web dev",
  quantity: 40,
  unit_price: 150,
  amount: 6000,
  gl_account_id: null,
  sort_order: 0,
  extracted_data_id: "ed-1",
};

describe("PATCH /api/invoices/[id]/line-items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "New" });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid field name", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "raw_ai_response", value: "hack" });
    const res = await PATCH(request, { params });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when invoice not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makePatchRequest("inv-999", "li-1", { field: "description", value: "x" });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful update", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, description: "Updated" });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "Updated" });
    const res = await PATCH(request, { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.description).toBe("Updated");
  });

  it("returns 500 when updateLineItemField fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue(null);

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "New" });
    const res = await PATCH(request, { params });
    expect(res.status).toBe(500);
  });

  it("records correction when value changes", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, description: "Updated" });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "Updated" });
    await PATCH(request, { params });

    expect(mockRecordCorrection).toHaveBeenCalledWith(
      "inv-1",
      "org-1",
      "line_item.li-1.description",
      "Web dev",
      "Updated",
      "user-1"
    );
  });

  it("does not record correction when value is unchanged", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue(fakeLineItem);

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "Web dev" });
    await PATCH(request, { params });

    expect(mockRecordCorrection).not.toHaveBeenCalled();
  });

  it("records GL mapping when gl_account_id is set to a non-null value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, gl_account_id: "acc-84" });
    mockUpsertGlMapping.mockResolvedValue(undefined);

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "gl_account_id", value: "acc-84" });
    await PATCH(request, { params });

    expect(mockUpsertGlMapping).toHaveBeenCalledWith("org-1", "Acme Corp", "Web dev", "acc-84");
  });

  it("does not record GL mapping when gl_account_id is set to null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, gl_account_id: null });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "gl_account_id", value: null });
    await PATCH(request, { params });

    expect(mockUpsertGlMapping).not.toHaveBeenCalled();
  });

  it("does not record GL mapping for non-gl_account_id fields", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockLineItemSelect.mockResolvedValue({ data: fakeLineItem, error: null });
    mockUpdateLineItemField.mockResolvedValue({ ...fakeLineItem, description: "Updated" });

    const { request, params } = makePatchRequest("inv-1", "li-1", { field: "description", value: "Updated" });
    await PATCH(request, { params });

    expect(mockUpsertGlMapping).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/invoices/[id]/line-items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeDeleteRequest("inv-1", "li-1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when invoice not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: null, error: { message: "not found" } });

    const { request, params } = makeDeleteRequest("inv-999", "li-1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 200 with deleted: true on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockDeleteLineItem.mockResolvedValue(true);

    const { request, params } = makeDeleteRequest("inv-1", "li-1");
    const res = await DELETE(request, { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it("returns 500 when delete fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvoiceSelect.mockResolvedValue({ data: fakeInvoice, error: null });
    mockDeleteLineItem.mockResolvedValue(false);

    const { request, params } = makeDeleteRequest("inv-1", "li-1");
    const res = await DELETE(request, { params });
    expect(res.status).toBe(500);
  });
});
