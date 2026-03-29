import {
  getContactOptions,
  createContact,
  fetchAccounts as xeroFetchAccounts,
  fetchPaymentAccounts as xeroFetchPaymentAccounts,
  fetchTrackingCategories as xeroFetchTrackingCategories,
  createInvoice,
  createBankTransaction,
  attachDocumentToInvoice,
  attachDocumentToBankTransaction,
  XeroApiError,
} from "@/lib/xero/api";
import type {
  XeroInvoicePayload,
  XeroLineItem,
  XeroBankTransactionPayload,
  XeroBankTransactionLineItem,
} from "@/lib/xero/types";
import type { AccountingProvider } from "../provider";
import {
  AccountingApiError,
  type VendorOption,
  type AccountOption,
  type PaymentAccount,
  type TrackingCategory,
  type CreateBillInput,
  type CreatePurchaseInput,
  type TransactionResult,
  type AttachmentResult,
} from "../types";
import { logger } from "@/lib/utils/logger";

/** Xero attachment size limit: 4 MB */
const XERO_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

// ─── Error Wrapping ───

function wrapXeroError(err: unknown): never {
  if (err instanceof XeroApiError) {
    throw new AccountingApiError({
      message: err.message,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      detail: err.detail,
      element: err.element,
    });
  }
  throw err;
}

// ─── Xero Adapter ───

export class XeroAccountingAdapter implements AccountingProvider {
  readonly providerType = "xero" as const;

  async fetchVendors(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<VendorOption[]> {
    try {
      return await getContactOptions(supabase, orgId);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async createVendor(
    supabase: SupabaseAdminClient,
    orgId: string,
    displayName: string,
    address?: string | null
  ): Promise<VendorOption> {
    try {
      return await createContact(supabase, orgId, displayName, address);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]> {
    try {
      return await xeroFetchAccounts(supabase, orgId);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async fetchPaymentAccounts(
    supabase: SupabaseAdminClient,
    orgId: string,
    accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    try {
      return await xeroFetchPaymentAccounts(supabase, orgId, accountType);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async fetchTrackingCategories(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<TrackingCategory[]> {
    try {
      return await xeroFetchTrackingCategories(supabase, orgId);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async createBill(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreateBillInput
  ): Promise<TransactionResult> {
    const lineItems: XeroLineItem[] = input.lineItems.map((item) => ({
      Description: item.description ?? "",
      Quantity: 1,
      UnitAmount: item.amount,
      AccountCode: item.glAccountId,
      ...(item.tracking?.length
        ? {
            Tracking: item.tracking.map((t) => ({
              TrackingCategoryID: t.categoryId,
              TrackingOptionID: t.optionId,
            })),
          }
        : {}),
    }));

    const payload: XeroInvoicePayload = {
      Type: "ACCPAY",
      Status: input.xeroStatus ?? "AUTHORISED",
      Contact: { ContactID: input.vendorRef },
      LineItems: lineItems,
      ...(input.invoiceDate ? { DateString: input.invoiceDate } : {}),
      ...(input.dueDate ? { DueDateString: input.dueDate } : {}),
      ...(input.invoiceNumber
        ? { InvoiceNumber: input.invoiceNumber, Reference: input.invoiceNumber }
        : {}),
    };

    try {
      const response = await createInvoice(supabase, orgId, payload);
      const invoice = response.Invoices[0];
      return {
        entityId: invoice.InvoiceID,
        entityType: "Bill",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async createPurchase(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreatePurchaseInput
  ): Promise<TransactionResult> {
    // Xero Bank Transactions (Type: "SPEND") are the equivalent of QBO's Purchase entity.
    // Used for Check, Cash, and Credit Card expense types.
    const lineItems: XeroBankTransactionLineItem[] = input.lineItems.map((item) => ({
      Description: item.description ?? "",
      Quantity: 1,
      UnitAmount: item.amount,
      AccountCode: item.glAccountId,
      ...(item.tracking?.length
        ? {
            Tracking: item.tracking.map((t) => ({
              TrackingCategoryID: t.categoryId,
              TrackingOptionID: t.optionId,
            })),
          }
        : {}),
    }));

    const payload: XeroBankTransactionPayload = {
      Type: "SPEND",
      Status: "AUTHORISED",
      Contact: { ContactID: input.vendorRef },
      BankAccount: { AccountID: input.paymentAccountRef },
      LineItems: lineItems,
      ...(input.invoiceDate ? { Date: input.invoiceDate } : {}),
      ...(input.invoiceNumber ? { Reference: input.invoiceNumber } : {}),
    };

    try {
      const response = await createBankTransaction(supabase, orgId, payload);
      const txn = response.BankTransactions[0];
      return {
        entityId: txn.BankTransactionID,
        entityType: "Purchase",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async attachDocument(
    supabase: SupabaseAdminClient,
    orgId: string,
    entityId: string,
    entityType: "Bill" | "Purchase",
    fileBuffer: Buffer,
    fileName: string
  ): Promise<AttachmentResult> {
    try {
      if (fileBuffer.byteLength > XERO_ATTACHMENT_MAX_BYTES) {
        const sizeMb = (fileBuffer.byteLength / (1024 * 1024)).toFixed(1);
        logger.warn("xero.attachment_too_large", {
          orgId,
          entityId,
          fileName,
          fileSizeBytes: fileBuffer.byteLength,
          limitBytes: XERO_ATTACHMENT_MAX_BYTES,
        });
        throw new Error(
          `File is ${sizeMb} MB — exceeds Xero's 4 MB attachment limit. You can attach it manually in Xero.`
        );
      }

      // Route to correct Xero endpoint based on entity type
      const response = entityType === "Purchase"
        ? await attachDocumentToBankTransaction(supabase, orgId, entityId, fileBuffer, fileName)
        : await attachDocumentToInvoice(supabase, orgId, entityId, fileBuffer, fileName);
      const attachmentId = response.Attachments?.[0]?.AttachmentID ?? null;
      return { attachmentId, success: true };
    } catch {
      // Attachment failure must not bubble up — caller decides how to handle partial success
      return { attachmentId: null, success: false };
    }
  }
}
