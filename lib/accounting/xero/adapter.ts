import {
  getContactOptions,
  createContact,
  fetchAccounts as xeroFetchAccounts,
  createInvoice,
  attachDocumentToInvoice,
  XeroApiError,
} from "@/lib/xero/api";
import type { XeroInvoicePayload, XeroLineItem } from "@/lib/xero/types";
import type { AccountingProvider } from "../provider";
import {
  AccountingApiError,
  type VendorOption,
  type AccountOption,
  type PaymentAccount,
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

  /* eslint-disable @typescript-eslint/no-unused-vars */

  async fetchPaymentAccounts(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    throw new Error(
      "Xero fetchPaymentAccounts not yet implemented. See DOC-57."
    );
  }

  /* eslint-enable @typescript-eslint/no-unused-vars */

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
    }));

    const payload: XeroInvoicePayload = {
      Type: "ACCPAY",
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
    // Xero doesn't have a direct "Purchase" entity like QBO.
    // Non-bill transactions (Check/Cash/CreditCard) map to Bank Transactions in Xero.
    // For now, create as ACCPAY invoice (bill) since Xero handles payments differently.
    // TODO: Implement Xero Bank Transactions for non-bill output types when DOC-57 lands.
    const lineItems: XeroLineItem[] = input.lineItems.map((item) => ({
      Description: item.description ?? "",
      Quantity: 1,
      UnitAmount: item.amount,
      AccountCode: item.glAccountId,
    }));

    const payload: XeroInvoicePayload = {
      Type: "ACCPAY",
      Contact: { ContactID: input.vendorRef },
      LineItems: lineItems,
      ...(input.invoiceDate ? { DateString: input.invoiceDate } : {}),
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

  async attachDocument(
    supabase: SupabaseAdminClient,
    orgId: string,
    entityId: string,
    _entityType: "Bill" | "Purchase",
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

      const response = await attachDocumentToInvoice(
        supabase,
        orgId,
        entityId,
        fileBuffer,
        fileName
      );
      const attachmentId = response.Attachments?.[0]?.AttachmentID ?? null;
      return { attachmentId, success: true };
    } catch {
      // Attachment failure must not bubble up — caller decides how to handle partial success
      return { attachmentId: null, success: false };
    }
  }
}
