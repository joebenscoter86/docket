import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Xero API layer
vi.mock("@/lib/xero/api", () => ({
  getContactOptions: vi.fn(),
  createContact: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchPaymentAccounts: vi.fn(),
  createInvoice: vi.fn(),
  createBankTransaction: vi.fn(),
  attachDocumentToInvoice: vi.fn(),
  attachDocumentToBankTransaction: vi.fn(),
  XeroApiError: class XeroApiError extends Error {
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
      this.name = "XeroApiError";
      this.statusCode = params.statusCode;
      this.errorCode = params.errorCode;
      this.detail = params.detail;
      this.element = params.element;
    }
  },
}));

import {
  getContactOptions,
  createContact,
  fetchAccounts,
  fetchPaymentAccounts,
  createInvoice,
  createBankTransaction,
  attachDocumentToInvoice,
  attachDocumentToBankTransaction,
  XeroApiError,
} from "@/lib/xero/api";
import { AccountingApiError } from "@/lib/accounting/types";

const mockGetContactOptions = vi.mocked(getContactOptions);
const mockCreateContact = vi.mocked(createContact);
const mockFetchAccounts = vi.mocked(fetchAccounts);
const mockFetchPaymentAccounts = vi.mocked(fetchPaymentAccounts);
const mockCreateInvoice = vi.mocked(createInvoice);
const mockCreateBankTransaction = vi.mocked(createBankTransaction);
const mockAttachDocument = vi.mocked(attachDocumentToInvoice);
const mockAttachBankTransaction = vi.mocked(attachDocumentToBankTransaction);

async function getAdapter() {
  const { XeroAccountingAdapter } = await import(
    "@/lib/accounting/xero/adapter"
  );
  return new XeroAccountingAdapter();
}

const mockSupabase = {} as Parameters<typeof getContactOptions>[0];

beforeEach(() => vi.clearAllMocks());

describe("XeroAccountingAdapter", () => {
  describe("fetchVendors", () => {
    it("delegates to getContactOptions and returns VendorOption[]", async () => {
      mockGetContactOptions.mockResolvedValue([
        { value: "id-1", label: "Vendor A" },
        { value: "id-2", label: "Vendor B" },
      ]);

      const adapter = await getAdapter();
      const result = await adapter.fetchVendors(mockSupabase, "org-1");

      expect(mockGetContactOptions).toHaveBeenCalledWith(mockSupabase, "org-1");
      expect(result).toEqual([
        { value: "id-1", label: "Vendor A" },
        { value: "id-2", label: "Vendor B" },
      ]);
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockGetContactOptions.mockRejectedValue(
        new XeroApiError({
          message: "Token expired",
          statusCode: 401,
          errorCode: "401",
          detail: "Token expired",
        })
      );

      const adapter = await getAdapter();
      await expect(adapter.fetchVendors(mockSupabase, "org-1")).rejects.toThrow(
        AccountingApiError
      );
    });
  });

  describe("createVendor", () => {
    it("delegates to createContact and returns VendorOption", async () => {
      mockCreateContact.mockResolvedValue({
        value: "id-new",
        label: "New Co",
      });

      const adapter = await getAdapter();
      const result = await adapter.createVendor(
        mockSupabase,
        "org-1",
        "New Co",
        "123 Main St"
      );

      expect(mockCreateContact).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "New Co",
        "123 Main St"
      );
      expect(result).toEqual({ value: "id-new", label: "New Co" });
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockCreateContact.mockRejectedValue(
        new XeroApiError({
          message: "Validation failed",
          statusCode: 400,
          errorCode: "400",
          detail: "Name is required",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createVendor(mockSupabase, "org-1", "")
      ).rejects.toThrow(AccountingApiError);
    });
  });

  describe("fetchAccounts", () => {
    it("delegates to lib/xero/api.fetchAccounts and returns AccountOption[]", async () => {
      mockFetchAccounts.mockResolvedValue([
        { value: "500", label: "Advertising", accountType: "EXPENSE", classification: "Expense" },
        { value: "600", label: "Office Supplies", accountType: "EXPENSE", classification: "Expense" },
      ]);

      const adapter = await getAdapter();
      const result = await adapter.fetchAccounts(mockSupabase, "org-1");

      expect(mockFetchAccounts).toHaveBeenCalledWith(mockSupabase, "org-1");
      expect(result).toEqual([
        { value: "500", label: "Advertising", accountType: "EXPENSE", classification: "Expense" },
        { value: "600", label: "Office Supplies", accountType: "EXPENSE", classification: "Expense" },
      ]);
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockFetchAccounts.mockRejectedValue(
        new XeroApiError({
          message: "Token expired",
          statusCode: 401,
          errorCode: "Unauthorized",
          detail: "Token expired",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.fetchAccounts(mockSupabase, "org-1")
      ).rejects.toThrow(AccountingApiError);
    });

    it("re-throws non-XeroApiError errors as-is", async () => {
      mockFetchAccounts.mockRejectedValue(new Error("Network failure"));

      const adapter = await getAdapter();
      await expect(
        adapter.fetchAccounts(mockSupabase, "org-1")
      ).rejects.toThrow("Network failure");
    });
  });

  describe("fetchPaymentAccounts", () => {
    it("delegates to xeroFetchPaymentAccounts and returns result", async () => {
      const mockAccounts = [
        { id: "acc-uuid-1", name: "Business Checking", accountType: "Bank" },
        { id: "acc-uuid-2", name: "Savings", accountType: "Bank" },
      ];
      mockFetchPaymentAccounts.mockResolvedValue(mockAccounts);

      const adapter = await getAdapter();
      const result = await adapter.fetchPaymentAccounts(mockSupabase, "org-1", "Bank");

      expect(result).toEqual(mockAccounts);
      expect(mockFetchPaymentAccounts).toHaveBeenCalledWith(mockSupabase, "org-1", "Bank");
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockFetchPaymentAccounts.mockRejectedValue(
        new XeroApiError({
          message: "Unauthorized",
          statusCode: 401,
          errorCode: "401",
          detail: "Token expired",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.fetchPaymentAccounts(mockSupabase, "org-1", "CreditCard")
      ).rejects.toThrow(AccountingApiError);
    });
  });

  describe("createBill", () => {
    it("maps CreateBillInput to Xero ACCPAY invoice and returns TransactionResult", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid",
            InvoiceNumber: "INV-001",
            Type: "ACCPAY",
            Status: "DRAFT",
            Contact: { ContactID: "contact-1", Name: "Acme Corp" },
            DateString: "2026-03-20",
            DueDateString: "2026-04-20",
            Total: 225.0,
            AmountDue: 225.0,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [
          { amount: 150, glAccountId: "500", description: "Office Supplies" },
          { amount: 75, glAccountId: "600", description: null },
        ],
        invoiceDate: "2026-03-20",
        dueDate: "2026-04-20",
        invoiceNumber: "INV-001",
      });

      expect(result.entityId).toBe("xero-inv-uuid");
      expect(result.entityType).toBe("Bill");
      expect(result.providerResponse).toBeDefined();

      // Verify the payload sent to createInvoice
      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.Type).toBe("ACCPAY");
      expect(payload.Contact.ContactID).toBe("contact-1");
      expect(payload.LineItems).toHaveLength(2);
      expect(payload.LineItems[0]).toEqual({
        Description: "Office Supplies",
        Quantity: 1,
        UnitAmount: 150,
        AccountCode: "500",
      });
      expect(payload.LineItems[1].Description).toBe("");
      expect(payload.DateString).toBe("2026-03-20");
      expect(payload.DueDateString).toBe("2026-04-20");
      expect(payload.InvoiceNumber).toBe("INV-001");
      expect(payload.Reference).toBe("INV-001");
    });

    it("omits optional fields when null", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-2",
            InvoiceNumber: "",
            Type: "ACCPAY",
            Status: "DRAFT",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "",
            DueDateString: "",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: null,
        dueDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.DateString).toBeUndefined();
      expect(payload.DueDateString).toBeUndefined();
      expect(payload.InvoiceNumber).toBeUndefined();
      expect(payload.Reference).toBeUndefined();
    });

    it("defaults to AUTHORISED when xeroStatus is not provided", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-3",
            InvoiceNumber: "INV-002",
            Type: "ACCPAY",
            Status: "AUTHORISED",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-28",
            DueDateString: "2026-04-28",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-28",
        dueDate: "2026-04-28",
        invoiceNumber: "INV-002",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.Status).toBe("AUTHORISED");
    });

    it("uses DRAFT status when xeroStatus is DRAFT", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-4",
            InvoiceNumber: "INV-003",
            Type: "ACCPAY",
            Status: "DRAFT",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-28",
            DueDateString: "2026-04-28",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-28",
        dueDate: "2026-04-28",
        invoiceNumber: "INV-003",
        xeroStatus: "DRAFT",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.Status).toBe("DRAFT");
    });

    it("sends LineAmountTypes when taxTreatment is provided", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-5",
            InvoiceNumber: "INV-004",
            Type: "ACCPAY",
            Status: "AUTHORISED",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-28",
            DueDateString: "2026-04-28",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-28",
        dueDate: "2026-04-28",
        invoiceNumber: "INV-004",
        taxTreatment: "inclusive",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.LineAmountTypes).toBe("Inclusive");
    });

    it("defaults LineAmountTypes to Exclusive when taxTreatment is not provided", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-6",
            InvoiceNumber: "INV-005",
            Type: "ACCPAY",
            Status: "AUTHORISED",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-28",
            DueDateString: "2026-04-28",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-28",
        dueDate: "2026-04-28",
        invoiceNumber: "INV-005",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.LineAmountTypes).toBe("Exclusive");
    });

    it("includes memo in Reference when both invoiceNumber and memo provided", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-memo",
            InvoiceNumber: "INV-001",
            Type: "ACCPAY",
            Status: "AUTHORISED",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-20",
            DueDateString: "",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-20",
        dueDate: null,
        invoiceNumber: "INV-001",
        memo: "Synced by joe@acme.com via Docket",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.InvoiceNumber).toBe("INV-001");
      expect(payload.Reference).toBe("INV-001 | Synced by joe@acme.com via Docket");
    });

    it("uses memo alone as Reference when no invoiceNumber", async () => {
      mockCreateInvoice.mockResolvedValue({
        Invoices: [
          {
            InvoiceID: "xero-inv-uuid-memo-only",
            InvoiceNumber: "",
            Type: "ACCPAY",
            Status: "AUTHORISED",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            DateString: "2026-03-20",
            DueDateString: "",
            Total: 100,
            AmountDue: 100,
            CurrencyCode: "USD",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createBill(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-20",
        dueDate: null,
        invoiceNumber: null,
        memo: "Synced by joe@acme.com via Docket",
      });

      const payload = mockCreateInvoice.mock.calls[0][2];
      expect(payload.InvoiceNumber).toBeUndefined();
      expect(payload.Reference).toBe("Synced by joe@acme.com via Docket");
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockCreateInvoice.mockRejectedValue(
        new XeroApiError({
          message: "Account code '999' is not a valid code",
          statusCode: 400,
          errorCode: "400",
          detail: "Account code '999' is not a valid code",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createBill(mockSupabase, "org-1", {
          vendorRef: "contact-1",
          lineItems: [{ amount: 100, glAccountId: "999", description: null }],
          invoiceDate: null,
          dueDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow(AccountingApiError);
    });

    it("re-throws non-XeroApiError errors as-is", async () => {
      mockCreateInvoice.mockRejectedValue(new Error("Network failure"));

      const adapter = await getAdapter();
      await expect(
        adapter.createBill(mockSupabase, "org-1", {
          vendorRef: "contact-1",
          lineItems: [{ amount: 100, glAccountId: "500", description: null }],
          invoiceDate: null,
          dueDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow("Network failure");
    });
  });

  describe("createPurchase", () => {
    it("creates a SPEND bank transaction for Check payment type", async () => {
      mockCreateBankTransaction.mockResolvedValue({
        BankTransactions: [
          {
            BankTransactionID: "xero-bt-uuid",
            Type: "SPEND",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            BankAccount: { AccountID: "bank-1", Name: "Business Checking", Code: "090" },
            DateString: "2026-03-20",
            Reference: "CHK-001",
            Total: 200,
            Status: "AUTHORISED",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        paymentAccountRef: "bank-1",
        paymentType: "Check",
        lineItems: [{ amount: 200, glAccountId: "500", description: "Check payment" }],
        invoiceDate: "2026-03-20",
        invoiceNumber: "CHK-001",
      });

      expect(result.entityId).toBe("xero-bt-uuid");
      expect(result.entityType).toBe("Purchase");

      const payload = mockCreateBankTransaction.mock.calls[0][2];
      expect(payload.Type).toBe("SPEND");
      expect(payload.Status).toBe("AUTHORISED");
      expect(payload.BankAccount.AccountID).toBe("bank-1");
      expect(payload.Contact.ContactID).toBe("contact-1");
      expect(payload.Date).toBe("2026-03-20");
      expect(payload.Reference).toBe("CHK-001");
      expect(payload.LineItems).toHaveLength(1);
      expect(payload.LineItems[0]).toEqual({
        Description: "Check payment",
        Quantity: 1,
        UnitAmount: 200,
        AccountCode: "500",
      });
    });

    it("creates a SPEND bank transaction for CreditCard payment type", async () => {
      mockCreateBankTransaction.mockResolvedValue({
        BankTransactions: [
          {
            BankTransactionID: "xero-cc-uuid",
            Type: "SPEND",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            BankAccount: { AccountID: "cc-1", Name: "Visa Card", Code: "091" },
            DateString: "2026-03-20",
            Total: 50,
            Status: "AUTHORISED",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        paymentAccountRef: "cc-1",
        paymentType: "CreditCard",
        lineItems: [{ amount: 50, glAccountId: "600", description: null }],
        invoiceDate: "2026-03-20",
        invoiceNumber: null,
      });

      expect(result.entityId).toBe("xero-cc-uuid");
      expect(result.entityType).toBe("Purchase");

      const payload = mockCreateBankTransaction.mock.calls[0][2];
      expect(payload.BankAccount.AccountID).toBe("cc-1");
      expect(payload.LineItems[0].Description).toBe("");
    });

    it("omits optional fields when null", async () => {
      mockCreateBankTransaction.mockResolvedValue({
        BankTransactions: [
          {
            BankTransactionID: "xero-bt-uuid-2",
            Type: "SPEND",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            BankAccount: { AccountID: "bank-1", Name: "Checking", Code: "090" },
            DateString: "",
            Total: 100,
            Status: "AUTHORISED",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        paymentAccountRef: "bank-1",
        paymentType: "Cash",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: null,
        invoiceNumber: null,
      });

      const payload = mockCreateBankTransaction.mock.calls[0][2];
      expect(payload.Date).toBeUndefined();
      expect(payload.Reference).toBeUndefined();
    });

    it("maps memo to Reference on purchase payload", async () => {
      mockCreateBankTransaction.mockResolvedValue({
        BankTransactions: [
          {
            BankTransactionID: "xero-bt-uuid-memo",
            Type: "SPEND",
            Contact: { ContactID: "contact-1", Name: "Acme" },
            BankAccount: { AccountID: "bank-1", Name: "Business Checking", Code: "090" },
            DateString: "2026-03-20",
            Reference: "Synced by joe@acme.com via Docket",
            Total: 100,
            Status: "AUTHORISED",
            LineItems: [],
          },
        ],
      });

      const adapter = await getAdapter();
      await adapter.createPurchase(mockSupabase, "org-1", {
        vendorRef: "contact-1",
        paymentAccountRef: "bank-1",
        paymentType: "Check",
        lineItems: [{ amount: 100, glAccountId: "500", description: null }],
        invoiceDate: "2026-03-20",
        invoiceNumber: null,
        memo: "Synced by joe@acme.com via Docket",
      });

      const payload = mockCreateBankTransaction.mock.calls[0][2];
      expect(payload.Reference).toBe("Synced by joe@acme.com via Docket");
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      mockCreateBankTransaction.mockRejectedValue(
        new XeroApiError({
          message: "Contact is not valid",
          statusCode: 400,
          errorCode: "400",
          detail: "Contact is not valid",
        })
      );

      const adapter = await getAdapter();
      await expect(
        adapter.createPurchase(mockSupabase, "org-1", {
          vendorRef: "bad-contact",
          paymentAccountRef: "bank-1",
          paymentType: "Check",
          lineItems: [{ amount: 100, glAccountId: "500", description: null }],
          invoiceDate: null,
          invoiceNumber: null,
        })
      ).rejects.toThrow(AccountingApiError);
    });
  });

  describe("attachDocument", () => {
    it("returns failure without calling API when file exceeds 4MB", async () => {
      const largeBuffer = Buffer.alloc(4 * 1024 * 1024 + 1); // 4MB + 1 byte

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "inv-uuid",
        "Bill",
        largeBuffer,
        "large-invoice.pdf"
      );

      expect(result.success).toBe(false);
      expect(result.attachmentId).toBeNull();
      expect(mockAttachDocument).not.toHaveBeenCalled();
    });

    it("proceeds with upload when file is exactly 4MB", async () => {
      mockAttachDocument.mockResolvedValue({
        Attachments: [
          {
            AttachmentID: "att-uuid-exact",
            FileName: "invoice.pdf",
            Url: "https://api.xero.com/...",
            MimeType: "application/pdf",
            ContentLength: 4 * 1024 * 1024,
          },
        ],
      });

      const exactBuffer = Buffer.alloc(4 * 1024 * 1024); // exactly 4MB

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "inv-uuid",
        "Bill",
        exactBuffer,
        "invoice.pdf"
      );

      expect(result.success).toBe(true);
      expect(result.attachmentId).toBe("att-uuid-exact");
      expect(mockAttachDocument).toHaveBeenCalled();
    });

    it("delegates to attachDocumentToInvoice and returns success", async () => {
      mockAttachDocument.mockResolvedValue({
        Attachments: [
          {
            AttachmentID: "att-uuid-1",
            FileName: "invoice.pdf",
            Url: "https://api.xero.com/...",
            MimeType: "application/pdf",
            ContentLength: 1024,
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "inv-uuid",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );

      expect(result.success).toBe(true);
      expect(result.attachmentId).toBe("att-uuid-1");
      expect(mockAttachDocument).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "inv-uuid",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );
    });

    it("returns failure without throwing on attachment error", async () => {
      mockAttachDocument.mockRejectedValue(new Error("Upload failed"));

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "inv-uuid",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );

      expect(result.success).toBe(false);
      expect(result.attachmentId).toBeNull();
    });

    it("returns failure on XeroApiError without throwing", async () => {
      mockAttachDocument.mockRejectedValue(
        new XeroApiError({
          message: "Not found",
          statusCode: 404,
          errorCode: "404",
          detail: "Invoice not found",
        })
      );

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "inv-uuid",
        "Bill",
        Buffer.from("PDF content"),
        "invoice.pdf"
      );

      expect(result.success).toBe(false);
      expect(result.attachmentId).toBeNull();
    });

    it("routes Purchase attachments to attachDocumentToBankTransaction", async () => {
      mockAttachBankTransaction.mockResolvedValue({
        Attachments: [
          {
            AttachmentID: "att-bt-uuid",
            FileName: "receipt.pdf",
            Url: "https://api.xero.com/...",
            MimeType: "application/pdf",
            ContentLength: 2048,
          },
        ],
      });

      const adapter = await getAdapter();
      const result = await adapter.attachDocument(
        mockSupabase,
        "org-1",
        "bt-uuid",
        "Purchase",
        Buffer.from("PDF content"),
        "receipt.pdf"
      );

      expect(result.success).toBe(true);
      expect(result.attachmentId).toBe("att-bt-uuid");
      expect(mockAttachBankTransaction).toHaveBeenCalledWith(
        mockSupabase,
        "org-1",
        "bt-uuid",
        Buffer.from("PDF content"),
        "receipt.pdf"
      );
      expect(mockAttachDocument).not.toHaveBeenCalled();
    });
  });
});
