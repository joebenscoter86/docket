import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Xero API layer
vi.mock("@/lib/xero/api", () => ({
  getContactOptions: vi.fn(),
  createContact: vi.fn(),
  fetchAccounts: vi.fn(),
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

import { getContactOptions, createContact, fetchAccounts, XeroApiError } from "@/lib/xero/api";
import { AccountingApiError } from "@/lib/accounting/types";

const mockGetContactOptions = vi.mocked(getContactOptions);
const mockCreateContact = vi.mocked(createContact);
const mockFetchAccounts = vi.mocked(fetchAccounts);

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
        { value: "500", label: "Advertising", accountType: "EXPENSE" },
        { value: "600", label: "Office Supplies", accountType: "EXPENSE" },
      ]);

      const adapter = await getAdapter();
      const result = await adapter.fetchAccounts(mockSupabase, "org-1");

      expect(mockFetchAccounts).toHaveBeenCalledWith(mockSupabase, "org-1");
      expect(result).toEqual([
        { value: "500", label: "Advertising", accountType: "EXPENSE" },
        { value: "600", label: "Office Supplies", accountType: "EXPENSE" },
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

  describe("unimplemented methods", () => {
    it("fetchPaymentAccounts throws not implemented", async () => {
      const adapter = await getAdapter();
      await expect(
        adapter.fetchPaymentAccounts(mockSupabase, "org-1", "Bank")
      ).rejects.toThrow("not yet implemented");
    });

    it("createBill throws not implemented", async () => {
      const adapter = await getAdapter();
      await expect(
        adapter.createBill(mockSupabase, "org-1", {} as never)
      ).rejects.toThrow("not yet implemented");
    });

    it("createPurchase throws not implemented", async () => {
      const adapter = await getAdapter();
      await expect(
        adapter.createPurchase(mockSupabase, "org-1", {} as never)
      ).rejects.toThrow("not yet implemented");
    });

    it("attachDocument throws not implemented", async () => {
      const adapter = await getAdapter();
      await expect(
        adapter.attachDocument(
          mockSupabase,
          "org-1",
          "id",
          "Bill",
          Buffer.from(""),
          "file.pdf"
        )
      ).rejects.toThrow("not yet implemented");
    });
  });
});
