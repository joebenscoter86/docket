import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------

const mockSelectSingle = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockLineItemUpdate = vi.fn();
const mockLineItemSelectSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "extracted_data") {
        return {
          select: () => ({
            eq: () => ({
              single: mockSelectSingle,
            }),
          }),
          update: (data: unknown) => {
            mockUpdate(data);
            return {
              eq: () => ({
                select: () => ({
                  single: mockSelectSingle,
                }),
              }),
            };
          },
        };
      }
      if (table === "corrections") {
        return { insert: mockInsert };
      }
      if (table === "extracted_line_items") {
        return {
          update: (data: unknown) => {
            mockLineItemUpdate(data);
            return {
              eq: () => ({
                select: () => ({
                  single: mockLineItemSelectSingle,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getExtractedData, updateExtractedField, recordCorrection, updateLineItemField } from "./data";

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const MOCK_EXTRACTED_DATA = {
  id: "ed-uuid-1",
  invoice_id: "inv-uuid-1",
  vendor_name: "Acme Corp",
  vendor_address: "123 Main St",
  invoice_number: "INV-001",
  invoice_date: "2026-03-01",
  due_date: "2026-03-31",
  subtotal: 900,
  tax_amount: 90,
  total_amount: 990,
  currency: "USD",
  payment_terms: "Net 30",
  confidence_score: "high",
  extracted_at: "2026-03-15T10:00:00Z",
  extracted_line_items: [
    {
      id: "li-uuid-1",
      description: "Widget A",
      quantity: 10,
      unit_price: 90,
      amount: 900,
      gl_account_id: null,
      sort_order: 0,
    },
  ],
};

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("getExtractedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns extracted data with line items for a valid invoice", async () => {
    mockSelectSingle.mockResolvedValue({
      data: MOCK_EXTRACTED_DATA,
      error: null,
    });

    const result = await getExtractedData("inv-uuid-1");

    expect(result).not.toBeNull();
    expect(result!.vendor_name).toBe("Acme Corp");
    expect(result!.extracted_line_items).toHaveLength(1);
  });

  it("returns null when no extraction exists for the invoice", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const result = await getExtractedData("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns null and logs warning on unexpected Supabase error", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST500", message: "connection timeout" },
    });

    const result = await getExtractedData("inv-uuid-1");
    expect(result).toBeNull();
  });
});

describe("updateExtractedField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const UPDATABLE_FIELDS = [
    "vendor_name",
    "vendor_address",
    "invoice_number",
    "invoice_date",
    "due_date",
    "subtotal",
    "tax_amount",
    "total_amount",
    "currency",
    "payment_terms",
  ] as const;

  it("updates a valid field and returns the updated row", async () => {
    const updated = { ...MOCK_EXTRACTED_DATA, vendor_name: "New Vendor" };
    mockSelectSingle.mockResolvedValue({ data: updated, error: null });

    const result = await updateExtractedField("ed-uuid-1", "vendor_name", "New Vendor");

    expect(mockUpdate).toHaveBeenCalledWith({ vendor_name: "New Vendor" });
    expect(result).not.toBeNull();
    expect(result!.vendor_name).toBe("New Vendor");
  });

  it("rejects updates to non-editable fields", async () => {
    await expect(
      updateExtractedField("ed-uuid-1", "raw_ai_response", "{}")
    ).rejects.toThrow("Field 'raw_ai_response' is not editable");
  });

  it("rejects updates to id field", async () => {
    await expect(
      updateExtractedField("ed-uuid-1", "id", "new-id")
    ).rejects.toThrow("Field 'id' is not editable");
  });

  it.each(UPDATABLE_FIELDS)("allows update to %s", async (field) => {
    mockSelectSingle.mockResolvedValue({
      data: { ...MOCK_EXTRACTED_DATA, [field]: "updated" },
      error: null,
    });

    const result = await updateExtractedField("ed-uuid-1", field, "updated");
    expect(result).not.toBeNull();
  });

  it("returns null and logs error on Supabase failure", async () => {
    mockSelectSingle.mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });

    const result = await updateExtractedField("ed-uuid-1", "vendor_name", "Test");
    expect(result).toBeNull();
  });
});

describe("recordCorrection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a correction row with all fields", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Acme Corp",
      "Acme Corporation"
    );

    expect(mockInsert).toHaveBeenCalledWith({
      invoice_id: "inv-uuid-1",
      org_id: "org-uuid-1",
      field_name: "vendor_name",
      original_value: "Acme Corp",
      corrected_value: "Acme Corporation",
    });
  });

  it("forwards user_id to insert when provided", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Acme Corp",
      "Acme Corporation",
      "user-uuid-1"
    );

    expect(mockInsert).toHaveBeenCalledWith({
      invoice_id: "inv-uuid-1",
      org_id: "org-uuid-1",
      field_name: "vendor_name",
      original_value: "Acme Corp",
      corrected_value: "Acme Corporation",
      user_id: "user-uuid-1",
    });
  });

  it("omits user_id from insert when not provided", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Acme Corp",
      "Acme Corporation"
    );

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg).not.toHaveProperty("user_id");
  });

  it("handles null original value", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "subtotal",
      null,
      "100.00"
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_value: null,
        corrected_value: "100.00",
      })
    );
  });

  it("logs error on Supabase failure but does not throw", async () => {
    mockInsert.mockResolvedValue({ error: { message: "RLS violation" } });

    // Should not throw
    await recordCorrection(
      "inv-uuid-1",
      "org-uuid-1",
      "vendor_name",
      "Old",
      "New"
    );
  });
});

describe("updateLineItemField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MOCK_LINE_ITEM = {
    id: "item-1",
    description: "Widget A",
    quantity: 10,
    unit_price: 90,
    amount: 900,
    gl_account_id: "84",
    suggested_gl_account_id: null,
    gl_suggestion_source: null,
    is_user_confirmed: true,
    sort_order: 0,
  };

  it("sets is_user_confirmed=true when gl_account_id is set to non-null", async () => {
    mockLineItemSelectSingle.mockResolvedValue({
      data: { ...MOCK_LINE_ITEM, gl_account_id: "84", is_user_confirmed: true },
      error: null,
    });

    const result = await updateLineItemField("item-1", "gl_account_id", "84");

    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      gl_account_id: "84",
      is_user_confirmed: true,
    });
    expect(result).not.toBeNull();
    expect(result!.is_user_confirmed).toBe(true);
  });

  it("sets is_user_confirmed=false when gl_account_id is cleared", async () => {
    mockLineItemSelectSingle.mockResolvedValue({
      data: { ...MOCK_LINE_ITEM, gl_account_id: null, is_user_confirmed: false },
      error: null,
    });

    const result = await updateLineItemField("item-1", "gl_account_id", null);

    expect(mockLineItemUpdate).toHaveBeenCalledWith({
      gl_account_id: null,
      is_user_confirmed: false,
    });
    expect(result).not.toBeNull();
    expect(result!.is_user_confirmed).toBe(false);
  });

  it("updates other fields without touching is_user_confirmed", async () => {
    mockLineItemSelectSingle.mockResolvedValue({
      data: { ...MOCK_LINE_ITEM, description: "Updated Widget" },
      error: null,
    });

    await updateLineItemField("item-1", "description", "Updated Widget");

    expect(mockLineItemUpdate).toHaveBeenCalledWith({ description: "Updated Widget" });
  });

  it("rejects updates to non-editable fields", async () => {
    await expect(
      updateLineItemField("item-1", "is_user_confirmed", true as unknown as string)
    ).rejects.toThrow("Field 'is_user_confirmed' is not editable on line items");
  });

  it("returns null and logs error on Supabase failure", async () => {
    mockLineItemSelectSingle.mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });

    const result = await updateLineItemField("item-1", "description", "test");
    expect(result).toBeNull();
  });
});
