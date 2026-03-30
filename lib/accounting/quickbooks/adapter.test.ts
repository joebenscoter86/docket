import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the QBO API layer
vi.mock("@/lib/quickbooks/api", () => ({
  getVendorOptions: vi.fn(),
  createVendor: vi.fn(),
  getAccountOptions: vi.fn(),
  fetchPaymentAccounts: vi.fn(),
  createBill: vi.fn(),
  createPurchase: vi.fn(),
  attachPdfToEntity: vi.fn(),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
    constructor(params: {
      message: string;
      statusCode: number;
      errorCode: string;
      detail: string;
      element?: string;
    }) {
      super(params.message);
      this.name = "QBOApiError";
      this.statusCode = params.statusCode;
      this.errorCode = params.errorCode;
      this.detail = params.detail;
      this.element = params.element;
    }
  },
}));

import {
  getVendorOptions,
  createVendor as qboCreateVendor,
  getAccountOptions,
  fetchPaymentAccounts as qboFetchPaymentAccounts,
  createBill as qboCreateBill,
  createPurchase as qboCreatePurchase,
  attachPdfToEntity,
  QBOApiError,
} from "@/lib/quickbooks/api";
import { AccountingApiError } from "@/lib/accounting/types";

const mockGetVendorOptions = vi.mocked(getVendorOptions);
const mockCreateVendor = vi.mocked(qboCreateVendor);
const mockGetAccountOptions = vi.mocked(getAccountOptions);
const mockFetchPaymentAccounts = vi.mocked(qboFetchPaymentAccounts);
const mockCreateBill = vi.mocked(qboCreateBill);
const mockCreatePurchase = vi.mocked(qboCreatePurchase);
const mockAttachPdfToEntity = vi.mocked(attachPdfToEntity);

async function getAdapter() {
  const { QuickBooksAccountingAdapter } = await import(
    "@/lib/accounting/quickbooks/adapter"
  );
  return new QuickBooksAccountingAdapter();
}

const mockSupabase = {} as Parameters<typeof getVendorOptions>[0];

beforeEach(() => vi.clearAllMocks());

describe("QuickBooksAccountingAdapter", () => {
  describe("fetchVendors", () => {
    it("delegates to getVendorOptions and returns VendorOption[]", async () => {
      mockGetVendorOptions.mockResolvedValue([
        { value: "1", label: "Acme Corp" },
        { value: "2", label: "Office Depot" },
      ]);

      const adapter = await getAdapter();
      const result = await adapter.fetchVendors(mockSupabase, "org-1");

      expect(mockGetVendorOptions).toHaveBeenCalledWith(mockSupabase, "org-1");
      expect(result).toEqual([
        { value: "1", label: "Acme Corp" },
        { value: "2", label: "Office Depot" },
      ]);
    });

    it("wraps QBOApiError into AccountingApiError", async () => {
      mockGetVendorOptions.mockRejectedValue(
        new QBOApiError({
          message: "Token expired",
          statusCode: 401,
          errorCode: "3200",
          detail: "Token expired",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.fetchVendors(mockSupabase, "org-1")
      ).rejects.toThrow(AccountingApiError);
    });
  });

  describe("createVendor", () => {
    it("delegates to qboCreateVendor and returns VendorOption", async () => {
      mockCreateVendor.mockResolvedValue({ value: "99", label: "New Vendor" });

      const adapter = await getAdapter();
      const result = await adapter.createVendor(
        mockSupabase,
        "org-1",
        "New Vendor",
        "123 Main St"
      );

      expect(mockCreateVendor).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "New Vendor",
        "123 Main St"
      );
      expect(result).toEqual({ value: "99", label: "New Vendor" });
    });

    it("wraps QBOApiError into AccountingApiError", async () => {
      mockCreateVendor.mockRejectedValue(
        new QBOApiError({
          message: "Validation failed",
          statusCode: 400,
          errorCode: "2020",
          detail: "DisplayName is required",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createVendor(mockSupabase, "org-1", "")
      ).rejects.toThrow(AccountingApiError);
    });
  });

  describe("fetchAccounts", () => {
    it("delegates to getAccountOptions and returns AccountOption[]", async () => {
      mockGetAccountOptions.mockResolvedValue([
        { value: "80", label: "Advertising", accountType: "Expense" },
      ]);

      const adapter = await getAdapter();
      const result = await adapter.fetchAccounts(mockSupabase, "org-1");

      expect(mockGetAccountOptions).toHaveBeenCalledWith(mockSupabase, "org-1");
      expect(result).toEqual([
        { value: "80", label: "Advertising", accountType: "Expense" },
      ]);
    });
  });

  describe("fetchPaymentAccounts", () => {
    it("delegates to qboFetchPaymentAccounts and returns result", async () => {
      const mockAccounts = [
        { id: "12", name: "Business Checking", accountType: "Bank" },
      ];
      mockFetchPaymentAccounts.mockResolvedValue(mockAccounts);

      const adapter = await getAdapter();
      const result = await adapter.fetchPaymentAccounts(
        mockSupabase,
        "org-1",
        "Bank"
      );

      expect(result).toEqual(mockAccounts);
      expect(mockFetchPaymentAccounts).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "Bank"
      );
    });
  });

  describe("createBill", () => {
    it("maps CreateBillInput to QBO bill payload and returns TransactionResult", async () => {
      mockCreateBill.mockResolvedValue({
        Bill: {
          Id: "qbo-bill-1",
          SyncToken: "0",
          VendorRef: { value: "42", name: "Acme Corp" },
          Line: [],
          TxnDate: "2026-03-20",
          DueDate: "2026-04-20",
          DocNumber: "INV-001",
          TotalAmt: 225.0,
          Balance: 225.0,
        },
      });

      const adapter = await getAdapter();
      const result = await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "42",
        lineItems: [
          { amount: 150, glAccountId: "80", description: "Office Supplies" },
          { amount: 75, glAccountId: "81", description: null },
        ],
        invoiceDate: "2026-03-20",
        dueDate: "2026-04-20",
        invoiceNumber: "INV-001",
      });

      expect(result.entityId).toBe("qbo-bill-1");
      expect(result.entityType).toBe("Bill");
      expect(result.providerResponse).toBeDefined();

      const payload = mockCreateBill.mock.calls[0][2];
      expect(payload.VendorRef).toEqual({ value: "42" });
      expect(payload.Line).toHaveLength(2);
      expect(payload.Line[0]).toEqual({
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: 150,
        AccountBasedExpenseLineDetail: { AccountRef: { value: "80" } },
        Description: "Office Supplies",
      });
      expect(payload.Line[1]).not.toHaveProperty("Description");
      expect(payload.TxnDate).toBe("2026-03-20");
      expect(payload.DueDate).toBe("2026-04-20");
      expect(payload.DocNumber).toBe("INV-001");
    });

    it("omits optional fields when null", async () => {
      mockCreateBill.mockResolvedValue({
        Bill: { Id: "qbo-bill-2", SyncToken: "0", VendorRef: { value: "42" }, Line: [], TotalAmt: 100, Balance: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "42",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        dueDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreateBill.mock.calls[0][2];
      expect(payload.TxnDate).toBeUndefined();
      expect(payload.DueDate).toBeUndefined();
      expect(payload.DocNumber).toBeUndefined();
    });

    it("maps memo to PrivateNote on bill payload", async () => {
      mockCreateBill.mockResolvedValue({
        Bill: { Id: "qbo-bill-memo", SyncToken: "0", VendorRef: { value: "42" }, Line: [], TotalAmt: 100, Balance: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "42",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: "2026-03-20",
        dueDate: null,
        invoiceNumber: null,
        memo: "Synced by user@example.com via Docket",
      });

      const payload = mockCreateBill.mock.calls[0][2];
      expect(payload.PrivateNote).toBe("Synced by user@example.com via Docket");
    });

    it("omits PrivateNote when memo is not provided on bill", async () => {
      mockCreateBill.mockResolvedValue({
        Bill: { Id: "qbo-bill-nomemo", SyncToken: "0", VendorRef: { value: "42" }, Line: [], TotalAmt: 100, Balance: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "42",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        dueDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreateBill.mock.calls[0][2];
      expect(payload.PrivateNote).toBeUndefined();
    });

    it("sends GlobalTaxCalculation when taxTreatment is provided", async () => {
      mockCreateBill.mockResolvedValue({
        Bill: { Id: "qbo-bill-tax", SyncToken: "0", VendorRef: { value: "42" }, Line: [], TotalAmt: 100, Balance: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "42",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        dueDate: null,
        invoiceNumber: null,
        taxTreatment: "exclusive",
      });

      const payload = mockCreateBill.mock.calls[0][2];
      expect(payload.GlobalTaxCalculation).toBe("TaxExcluded");
    });

    it("wraps QBOApiError into AccountingApiError", async () => {
      mockCreateBill.mockRejectedValue(
        new QBOApiError({
          message: "Vendor not found",
          statusCode: 400,
          errorCode: "6240",
          detail: "Vendor not found",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createBill(mockSupabase, "org-1", {
          vendorRef: "bad-vendor",
          lineItems: [{ amount: 100, glAccountId: "80", description: null }],
          invoiceDate: null,
          dueDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow(AccountingApiError);
    });

    it("re-throws non-QBOApiError errors as-is", async () => {
      mockCreateBill.mockRejectedValue(new Error("Network failure"));

      const adapter = await getAdapter();
      await expect(
        adapter.createBill(mockSupabase, "org-1", {
          vendorRef: "42",
          lineItems: [{ amount: 100, glAccountId: "80", description: null }],
          invoiceDate: null,
          dueDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow("Network failure");
    });
  });

  describe("createPurchase", () => {
    it("maps CreatePurchaseInput to QBO purchase payload and returns TransactionResult", async () => {
      mockCreatePurchase.mockResolvedValue({
        Purchase: {
          Id: "qbo-purchase-1",
          SyncToken: "0",
          PaymentType: "Check",
          AccountRef: { value: "35" },
          EntityRef: { value: "42", type: "Vendor" },
          Line: [],
          TxnDate: "2026-03-20",
          DocNumber: "CHK-001",
          TotalAmt: 200,
        },
      });

      const adapter = await getAdapter();
      const result = await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "42",
        paymentAccountRef: "35",
        paymentType: "Check",
        lineItems: [{ amount: 200, glAccountId: "80", description: "Check payment" }],
        invoiceDate: "2026-03-20",
        invoiceNumber: "CHK-001",
      });

      expect(result.entityId).toBe("qbo-purchase-1");
      expect(result.entityType).toBe("Purchase");

      const payload = mockCreatePurchase.mock.calls[0][2];
      expect(payload.PaymentType).toBe("Check");
      expect(payload.AccountRef).toEqual({ value: "35" });
      expect(payload.EntityRef).toEqual({ value: "42", type: "Vendor" });
      expect(payload.Line).toHaveLength(1);
      expect(payload.Line[0]).toEqual({
        Amount: 200,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: { AccountRef: { value: "80" } },
        Description: "Check payment",
      });
      expect(payload.TxnDate).toBe("2026-03-20");
      expect(payload.DocNumber).toBe("CHK-001");
    });

    it("omits optional fields when null", async () => {
      mockCreatePurchase.mockResolvedValue({
        Purchase: { Id: "qbo-purchase-2", SyncToken: "0", PaymentType: "Cash", AccountRef: { value: "35" }, EntityRef: { value: "42", type: "Vendor" }, Line: [], TotalAmt: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "42",
        paymentAccountRef: "35",
        paymentType: "Cash",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreatePurchase.mock.calls[0][2];
      expect(payload.TxnDate).toBeUndefined();
      expect(payload.DocNumber).toBeUndefined();
    });

    it("maps memo to PrivateNote on purchase payload", async () => {
      mockCreatePurchase.mockResolvedValue({
        Purchase: { Id: "qbo-purchase-memo", SyncToken: "0", PaymentType: "CreditCard", AccountRef: { value: "36" }, EntityRef: { value: "42", type: "Vendor" }, Line: [], TotalAmt: 50 },
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "42",
        paymentAccountRef: "36",
        paymentType: "CreditCard",
        lineItems: [{ amount: 50, glAccountId: "80", description: null }],
        invoiceDate: "2026-03-20",
        invoiceNumber: null,
        memo: "Synced by user@example.com via Docket",
      });

      const payload = mockCreatePurchase.mock.calls[0][2];
      expect(payload.PrivateNote).toBe("Synced by user@example.com via Docket");
    });

    it("omits PrivateNote when memo is not provided on purchase", async () => {
      mockCreatePurchase.mockResolvedValue({
        Purchase: { Id: "qbo-purchase-nomemo", SyncToken: "0", PaymentType: "Check", AccountRef: { value: "35" }, EntityRef: { value: "42", type: "Vendor" }, Line: [], TotalAmt: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "42",
        paymentAccountRef: "35",
        paymentType: "Check",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreatePurchase.mock.calls[0][2];
      expect(payload.PrivateNote).toBeUndefined();
    });

    it("sends GlobalTaxCalculation when taxTreatment is provided", async () => {
      mockCreatePurchase.mockResolvedValue({
        Purchase: { Id: "qbo-purchase-tax", SyncToken: "0", PaymentType: "Check", AccountRef: { value: "35" }, EntityRef: { value: "42", type: "Vendor" }, Line: [], TotalAmt: 100 },
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "42",
        paymentAccountRef: "35",
        paymentType: "Check",
        lineItems: [{ amount: 100, glAccountId: "80", description: null }],
        invoiceDate: null,
        invoiceNumber: null,
        taxTreatment: "inclusive",
      });

      const payload = mockCreatePurchase.mock.calls[0][2];
      expect(payload.GlobalTaxCalculation).toBe("TaxInclusive");
    });

    it("wraps QBOApiError into AccountingApiError", async () => {
      mockCreatePurchase.mockRejectedValue(
        new QBOApiError({
          message: "Account not found",
          statusCode: 400,
          errorCode: "2500",
          detail: "Account not found",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createPurchase(mockSupabase, "org-1", {
          vendorRef: "42",
          paymentAccountRef: "bad-account",
          paymentType: "Check",
          lineItems: [{ amount: 100, glAccountId: "80", description: null }],
          invoiceDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow(AccountingApiError);
    });

    it("re-throws non-QBOApiError errors as-is", async () => {
      mockCreatePurchase.mockRejectedValue(new Error("Network failure"));

      const adapter = await getAdapter();
      await expect(
        adapter.createPurchase(mockSupabase, "org-1", {
          vendorRef: "42",
          paymentAccountRef: "35",
          paymentType: "Check",
          lineItems: [{ amount: 100, glAccountId: "80", description: null }],
          invoiceDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow("Network failure");
    });
  });

  describe("attachDocument", () => {
    it("delegates to attachPdfToEntity and returns success", async () => {
      mockAttachPdfToEntity.mockResolvedValue({
        AttachableResponse: [
          {
            Attachable: {
              Id: "att-1",
              FileName: "invoice.pdf",
              ContentType: "application/pdf",
            },
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "bill-1",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );

      expect(result.success).toBe(true);
      expect(result.attachmentId).toBe("att-1");
      expect(mockAttachPdfToEntity).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "bill-1",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );
    });

    it("returns failure without throwing on attachment error", async () => {
      mockAttachPdfToEntity.mockRejectedValue(new Error("Upload failed"));

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "bill-1",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );

      expect(result.success).toBe(false);
      expect(result.attachmentId).toBeNull();
    });
  });
});
