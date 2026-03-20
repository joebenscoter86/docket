import {
  getContactOptions,
  createContact,
  XeroApiError,
} from "@/lib/xero/api";
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
    _supabase: SupabaseAdminClient,
    _orgId: string
  ): Promise<AccountOption[]> {
    throw new Error(
      "Xero fetchAccounts not yet implemented. See DOC-57."
    );
  }

  async fetchPaymentAccounts(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    throw new Error(
      "Xero fetchPaymentAccounts not yet implemented. See DOC-57."
    );
  }

  async createBill(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _input: CreateBillInput
  ): Promise<TransactionResult> {
    throw new Error(
      "Xero createBill not yet implemented. See DOC-58."
    );
  }

  async createPurchase(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _input: CreatePurchaseInput
  ): Promise<TransactionResult> {
    throw new Error(
      "Xero createPurchase not yet implemented. See DOC-58."
    );
  }

  async attachDocument(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _entityId: string,
    _entityType: "Bill" | "Purchase",
    _fileBuffer: Buffer,
    _fileName: string
  ): Promise<AttachmentResult> {
    throw new Error(
      "Xero attachDocument not yet implemented. See DOC-58."
    );
  }
}
