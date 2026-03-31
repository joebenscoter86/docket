import {
  getVendorOptions,
  createVendor as qboCreateVendor,
  getAccountOptions,
  fetchPaymentAccounts as qboFetchPaymentAccounts,
  queryTaxCodes,
  queryTaxRates,
  createBill as qboCreateBill,
  createPurchase as qboCreatePurchase,
  attachPdfToEntity,
  QBOApiError,
} from "@/lib/quickbooks/api";
import type {
  QBOBillPayload,
  QBOPurchasePayload,
} from "@/lib/quickbooks/types";
import type { AccountingProvider } from "../provider";
import {
  AccountingApiError,
  type VendorOption,
  type AccountOption,
  type PaymentAccount,
  type TrackingCategory,
  type TaxCodeOption,
  type CreateBillInput,
  type CreatePurchaseInput,
  type TransactionResult,
  type AttachmentResult,
} from "../types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/** Map provider-agnostic tax treatment to QBO's GlobalTaxCalculation values. */
const GLOBAL_TAX_MAP = {
  exclusive: "TaxExcluded",
  inclusive: "TaxInclusive",
  no_tax: "NotApplicable",
} as const;

// ─── Error Wrapping ───

/**
 * Convert a QBOApiError into the provider-agnostic AccountingApiError.
 * Re-throws the original error if it is not a QBOApiError.
 */
function wrapQBOError(err: unknown): never {
  if (err instanceof QBOApiError) {
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

// ─── QuickBooks Adapter ───

/**
 * Implements `AccountingProvider` by delegating to the existing
 * `lib/quickbooks/api.ts` functions.
 *
 * No QBO API logic lives here — this adapter only translates between the
 * provider-agnostic types and the QBO-specific types.
 */
export class QuickBooksAccountingAdapter implements AccountingProvider {
  readonly providerType = "quickbooks" as const;

  async fetchVendors(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<VendorOption[]> {
    try {
      return await getVendorOptions(supabase, orgId);
    } catch (err) {
      wrapQBOError(err);
    }
  }

  async createVendor(
    supabase: SupabaseAdminClient,
    orgId: string,
    displayName: string,
    address?: string | null
  ): Promise<VendorOption> {
    try {
      return await qboCreateVendor(supabase, orgId, displayName, address);
    } catch (err) {
      wrapQBOError(err);
    }
  }

  async fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]> {
    try {
      return await getAccountOptions(supabase, orgId);
    } catch (err) {
      wrapQBOError(err);
    }
  }

  async fetchPaymentAccounts(
    supabase: SupabaseAdminClient,
    orgId: string,
    accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    try {
      const accounts = await qboFetchPaymentAccounts(
        supabase,
        orgId,
        accountType
      );
      // QBOPaymentAccount shape already matches PaymentAccount — just return directly
      return accounts;
    } catch (err) {
      wrapQBOError(err);
    }
  }

  async fetchTaxCodes(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<TaxCodeOption[]> {
    try {
      const [taxCodes, taxRates] = await Promise.all([
        queryTaxCodes(supabase, orgId),
        queryTaxRates(supabase, orgId),
      ]);

      // Build a lookup of tax rate ID -> rate value
      const rateMap = new Map<string, number>();
      for (const rate of taxRates) {
        rateMap.set(rate.Id, rate.RateValue);
      }

      return taxCodes
        .filter((tc) => {
          // Filter out hidden codes
          if (tc.Hidden) return false;
          // Include pseudo codes (TAX/NON) -- they are not TaxGroups
          if (!tc.TaxGroup) return true;
          // For real tax codes, only include if they have purchase tax rates
          const purchaseRates = tc.PurchaseTaxRateList?.TaxRateDetail ?? [];
          return purchaseRates.length > 0;
        })
        .map((tc) => {
          // Calculate effective rate by summing purchase tax rates
          const purchaseRates = tc.PurchaseTaxRateList?.TaxRateDetail ?? [];
          let rate: number | null = null;
          if (purchaseRates.length > 0) {
            rate = purchaseRates.reduce((sum, detail) => {
              const rateValue = rateMap.get(detail.TaxRateRef.value);
              return sum + (rateValue ?? 0);
            }, 0);
          }

          return {
            value: tc.Id,
            label: tc.Name,
            rate,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (err) {
      wrapQBOError(err);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchTrackingCategories(supabase: SupabaseAdminClient, orgId: string): Promise<TrackingCategory[]> {
    // QBO classes/locations support will be added in DOC-125
    return [];
  }

  async createBill(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreateBillInput
  ): Promise<TransactionResult> {
    const payload: QBOBillPayload = {
      VendorRef: { value: input.vendorRef },
      Line: input.lineItems.map((item) => ({
        DetailType: "AccountBasedExpenseLineDetail" as const,
        Amount: item.amount,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: item.glAccountId },
          ...(item.taxCodeId ? { TaxCodeRef: { value: item.taxCodeId } } : {}),
        },
        ...(item.description ? { Description: item.description } : {}),
      })),
      ...(input.invoiceDate ? { TxnDate: input.invoiceDate } : {}),
      ...(input.dueDate ? { DueDate: input.dueDate } : {}),
      ...(input.invoiceNumber ? { DocNumber: input.invoiceNumber } : {}),
      GlobalTaxCalculation: input.taxTreatment ? GLOBAL_TAX_MAP[input.taxTreatment] : "TaxExcluded",
      ...(input.memo ? { PrivateNote: input.memo } : {}),
    };

    try {
      const response = await qboCreateBill(supabase, orgId, payload);
      return {
        entityId: response.Bill.Id,
        entityType: "Bill",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (err) {
      wrapQBOError(err);
    }
  }

  async createPurchase(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreatePurchaseInput
  ): Promise<TransactionResult> {
    const payload: QBOPurchasePayload = {
      PaymentType: input.paymentType,
      AccountRef: { value: input.paymentAccountRef },
      EntityRef: { value: input.vendorRef, type: "Vendor" },
      Line: input.lineItems.map((item) => ({
        Amount: item.amount,
        DetailType: "AccountBasedExpenseLineDetail" as const,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: item.glAccountId },
          ...(item.taxCodeId ? { TaxCodeRef: { value: item.taxCodeId } } : {}),
        },
        ...(item.description ? { Description: item.description } : {}),
      })),
      ...(input.invoiceDate ? { TxnDate: input.invoiceDate } : {}),
      ...(input.invoiceNumber ? { DocNumber: input.invoiceNumber } : {}),
      GlobalTaxCalculation: input.taxTreatment ? GLOBAL_TAX_MAP[input.taxTreatment] : "TaxExcluded",
      ...(input.memo ? { PrivateNote: input.memo } : {}),
    };

    try {
      const response = await qboCreatePurchase(supabase, orgId, payload);
      return {
        entityId: response.Purchase.Id,
        entityType: "Purchase",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (err) {
      wrapQBOError(err);
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
      const response = await attachPdfToEntity(
        supabase,
        orgId,
        entityId,
        entityType,
        fileBuffer,
        fileName
      );
      const attachmentId =
        response.AttachableResponse?.[0]?.Attachable?.Id ?? null;
      return { attachmentId, success: true };
    } catch {
      // Attachment failure must not bubble up — caller decides how to handle partial success
      return { attachmentId: null, success: false };
    }
  }
}
