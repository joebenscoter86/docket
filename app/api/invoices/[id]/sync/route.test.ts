// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();
const mockInvoiceSelect = vi.fn();
const mockSyncLogSelect = vi.fn();
const mockExtractedDataSelect = vi.fn();
const mockLineItemsSelect = vi.fn();
const mockSyncLogInsert = vi.fn();
const mockInvoiceUpdate = vi.fn();
const mockStorageDownload = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockMembershipSelect,
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockInvoiceSelect,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: mockInvoiceUpdate,
        })),
      };
    }
    if (table === "sync_log") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: mockSyncLogSelect,
                  })),
                })),
              })),
            })),
          })),
        })),
        insert: mockSyncLogInsert,
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
    if (table === "extracted_line_items") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: mockLineItemsSelect,
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
  storage: {
    from: vi.fn(() => ({
      download: mockStorageDownload,
    })),
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockCreateBill = vi.fn();
const mockCreatePurchase = vi.fn();
const mockAttachDocument = vi.fn();
const mockGetOrgProvider = vi.fn();

vi.mock("@/lib/accounting", () => ({
  getOrgProvider: (...args: unknown[]) => mockGetOrgProvider(...args),
  getAccountingProvider: () => ({
    createBill: (...args: unknown[]) => mockCreateBill(...args),
    createPurchase: (...args: unknown[]) => mockCreatePurchase(...args),
    attachDocument: (...args: unknown[]) => mockAttachDocument(...args),
  }),
  AccountingApiError: class AccountingApiError extends Error {
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
    constructor(
      statusCode: number,
      message: string,
      opts: { errorCode?: string; detail?: string; element?: string } = {}
    ) {
      super(message);
      this.name = "AccountingApiError";
      this.statusCode = statusCode;
      this.errorCode = opts.errorCode ?? "unknown";
      this.detail = opts.detail ?? message;
      this.element = opts.element;
    }
  },
}));

const mockCheckInvoiceAccess = vi.fn();
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "./route";

// ─── Helpers ───

function makeRequest(invoiceId = "inv-1") {
  return {
    request: new NextRequest(`http://localhost/api/invoices/${invoiceId}/sync`, {
      method: "POST",
    }),
    params: Promise.resolve({ id: invoiceId }),
  };
}

const fakeInvoice = {
  id: "inv-1",
  org_id: "org-1",
  status: "approved",
  output_type: "bill" as string,
  payment_account_id: null as string | null,
  payment_account_name: null as string | null,
  file_path: "org-1/inv-1/invoice.pdf",
  file_name: "invoice.pdf",
  retry_count: 0,
};

const fakeExtractedData = {
  id: "ed-1",
  invoice_id: "inv-1",
  vendor_name: "Acme Corp",
  vendor_ref: "vendor-42",
  invoice_number: "INV-001",
  invoice_date: "2026-03-15",
  due_date: "2026-04-15",
  total_amount: 150,
};

const fakeLineItems = [
  {
    id: "li-1",
    amount: 150,
    gl_account_id: "acct-1",
    description: "Consulting services",
    sort_order: 0,
  },
];

const fakeFileBlob = new Blob(["fake-pdf"]);

function setupSuccessMocks(invoiceOverrides: Partial<typeof fakeInvoice> = {}) {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockMembershipSelect.mockResolvedValue({ data: { active_org_id: "org-1" }, error: null });
  mockCheckInvoiceAccess.mockResolvedValue({ allowed: true });
  mockInvoiceSelect.mockResolvedValue({ data: { ...fakeInvoice, ...invoiceOverrides }, error: null });
  mockSyncLogSelect.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
  mockGetOrgProvider.mockResolvedValue("quickbooks");
  mockExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
  mockLineItemsSelect.mockResolvedValue({ data: fakeLineItems, error: null });
  mockSyncLogInsert.mockResolvedValue({ error: null });
  mockInvoiceUpdate.mockResolvedValue({ error: null });
  mockStorageDownload.mockResolvedValue({ data: fakeFileBlob, error: null });
  mockAttachDocument.mockResolvedValue({ attachmentId: "att-1", success: true });
}

// ─── Tests ───

describe("POST /api/invoices/[id]/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Bill happy path (regression) ──

  it("creates a Bill when output_type is 'bill' (default)", async () => {
    setupSuccessMocks();
    mockCreateBill.mockResolvedValue({ entityId: "bill-99", entityType: "Bill", providerResponse: { Bill: { Id: "bill-99", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.billId).toBe("bill-99");
    expect(body.data.message).toContain("Bill created");
    expect(mockCreateBill).toHaveBeenCalledOnce();
    expect(mockCreatePurchase).not.toHaveBeenCalled();
  });

  it("attaches PDF with entity type 'Bill' for bill sync", async () => {
    setupSuccessMocks();
    mockCreateBill.mockResolvedValue({ entityId: "bill-99", entityType: "Bill", providerResponse: { Bill: { Id: "bill-99", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    await POST(request, { params });

    expect(mockAttachDocument).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "bill-99",
      "Bill",
      expect.any(Buffer),
      "invoice.pdf"
    );
  });

  it("includes transaction_type and provider_entity_type in sync_log for bills", async () => {
    setupSuccessMocks();
    mockCreateBill.mockResolvedValue({ entityId: "bill-99", entityType: "Bill", providerResponse: { Bill: { Id: "bill-99", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    await POST(request, { params });

    expect(mockSyncLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_type: "bill",
        provider_entity_type: "Bill",
        status: "success",
      })
    );
  });

  // ── Check happy path ──

  it("creates a Purchase with PaymentType='Check' when output_type is 'check'", async () => {
    setupSuccessMocks({ output_type: "check", payment_account_id: "bank-1", payment_account_name: "Business Checking" });
    mockCreatePurchase.mockResolvedValue({ entityId: "purchase-1", entityType: "Purchase", providerResponse: { Purchase: { Id: "purchase-1", PaymentType: "Check", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.billId).toBe("purchase-1");
    expect(body.data.message).toContain("Check created");
    expect(mockCreatePurchase).toHaveBeenCalledOnce();
    expect(mockCreateBill).not.toHaveBeenCalled();

    // Verify the CreatePurchaseInput shape passed to provider
    const purchaseInput = mockCreatePurchase.mock.calls[0][2];
    expect(purchaseInput.paymentType).toBe("Check");
    expect(purchaseInput.paymentAccountRef).toBe("bank-1");
    expect(purchaseInput.vendorRef).toBe("vendor-42");
  });

  // ── Cash happy path ──

  it("creates a Purchase with PaymentType='Cash' when output_type is 'cash'", async () => {
    setupSuccessMocks({ output_type: "cash", payment_account_id: "bank-2" });
    mockCreatePurchase.mockResolvedValue({ entityId: "purchase-2", entityType: "Purchase", providerResponse: { Purchase: { Id: "purchase-2", PaymentType: "Cash", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toContain("Expense recorded");
    const purchaseInput = mockCreatePurchase.mock.calls[0][2];
    expect(purchaseInput.paymentType).toBe("Cash");
  });

  // ── CreditCard happy path ──

  it("creates a Purchase with PaymentType='CreditCard' when output_type is 'credit_card'", async () => {
    setupSuccessMocks({ output_type: "credit_card", payment_account_id: "cc-1" });
    mockCreatePurchase.mockResolvedValue({ entityId: "purchase-3", entityType: "Purchase", providerResponse: { Purchase: { Id: "purchase-3", PaymentType: "CreditCard", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toContain("Credit card");
    const purchaseInput = mockCreatePurchase.mock.calls[0][2];
    expect(purchaseInput.paymentType).toBe("CreditCard");
  });

  it("attaches PDF with entity type 'Purchase' for non-bill sync", async () => {
    setupSuccessMocks({ output_type: "check", payment_account_id: "bank-1" });
    mockCreatePurchase.mockResolvedValue({ entityId: "purchase-1", entityType: "Purchase", providerResponse: { Purchase: { Id: "purchase-1", PaymentType: "Check", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    await POST(request, { params });

    expect(mockAttachDocument).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "purchase-1",
      "Purchase",
      expect.any(Buffer),
      "invoice.pdf"
    );
  });

  it("includes transaction_type and provider_entity_type in sync_log for purchases", async () => {
    setupSuccessMocks({ output_type: "check", payment_account_id: "bank-1" });
    mockCreatePurchase.mockResolvedValue({ entityId: "purchase-1", entityType: "Purchase", providerResponse: { Purchase: { Id: "purchase-1", PaymentType: "Check", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    await POST(request, { params });

    expect(mockSyncLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_type: "check",
        provider_entity_type: "Purchase",
        status: "success",
      })
    );
  });

  // ── Missing payment_account_id validation ──

  it("returns validation error when non-bill type has no payment_account_id", async () => {
    setupSuccessMocks({ output_type: "check", payment_account_id: null });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("payment account");
  });

  it("does not require payment_account_id for bill type", async () => {
    setupSuccessMocks({ output_type: "bill", payment_account_id: null });
    mockCreateBill.mockResolvedValue({ entityId: "bill-99", entityType: "Bill", providerResponse: { Bill: { Id: "bill-99", TotalAmt: 150 } } });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });

    expect(res.status).toBe(200);
  });

  // ── Idempotency ──

  it("returns already_synced when idempotency guard matches same transaction type", async () => {
    setupSuccessMocks({ output_type: "check", payment_account_id: "bank-1" });
    mockSyncLogSelect.mockResolvedValue({ data: { provider_bill_id: "purchase-existing" }, error: null });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.attachmentStatus).toBe("already_synced");
    expect(body.data.billId).toBe("purchase-existing");
    expect(mockCreatePurchase).not.toHaveBeenCalled();
  });

  // ── No accounting connection ──

  it("returns validation error when no accounting provider is connected", async () => {
    setupSuccessMocks();
    mockGetOrgProvider.mockResolvedValue(null);

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("Connect an accounting provider");
  });

  // ── Sync log failure includes transaction_type ──

  it("includes transaction_type in sync_log on failure", async () => {
    setupSuccessMocks({ output_type: "cash", payment_account_id: "bank-2" });
    mockCreatePurchase.mockRejectedValue(new Error("QBO timeout"));

    const { request, params } = makeRequest();
    await POST(request, { params });

    expect(mockSyncLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_type: "cash",
        provider_entity_type: "Purchase",
        status: "failed",
      })
    );
  });

  // ── Auth checks (regression) ──

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { request, params } = makeRequest();
    const res = await POST(request, { params });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

});
