import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { checkInvoiceAccess } from "@/lib/billing/access";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import type { CreateBillInput, CreatePurchaseInput, SyncLineItem, TransactionResult, TrackingAssignment } from "@/lib/accounting";
import { inferTaxExpenseAccount } from "@/lib/accounting/tax-account-inference";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import {
  authError,
  notFound,
  conflict,
  validationError,
  apiSuccess,
  internalError,
  subscriptionRequired,
} from "@/lib/utils/errors";
import type { OutputType, ProviderEntityType, DuplicateMatch } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE, OUTPUT_TYPE_LABELS, SYNC_SUCCESS_MESSAGES } from "@/lib/types/invoice";
import { sendSyncSuccessEmail, sendSyncFailureEmail } from "@/lib/email/triggers";

/**
 * Translate accounting API errors into user-friendly messages.
 * Maps common error codes and patterns to actionable guidance.
 */
function translateAccountingError(error: AccountingApiError, outputType: OutputType): string {
  const typeLabel = OUTPUT_TYPE_LABELS[outputType].toLowerCase();
  const detail = error.detail ?? "";

  // Duplicate document number (QBO code 6140, or Xero message pattern)
  if (detail.includes("Duplicate") || error.errorCode === "6140") {
    return `A ${typeLabel} with this invoice number already exists. Change the invoice number and try again.`;
  }

  // Xero: contact not found
  if (detail.includes("ContactID") || detail.includes("Contact is not valid")) {
    return "The selected vendor was not found in Xero. They may have been deleted. Please select a different vendor.";
  }

  // Xero: invalid account code
  if (detail.includes("Account code") && detail.includes("is not a valid")) {
    return "One or more GL account codes are no longer valid in Xero. Please re-map the line item accounts and try again.";
  }

  // Vendor/entity not found (QBO pattern)
  if (
    detail.includes("Invalid Reference Id") &&
    (error.element === "VendorRef" || error.element === "EntityRef")
  ) {
    return "The selected vendor was not found. They may have been deleted. Please select a different vendor.";
  }

  // GL account not found (QBO pattern)
  if (
    detail.includes("Invalid Reference Id") &&
    error.element === "AccountRef"
  ) {
    return "One or more GL accounts are no longer valid. Please re-map the line item accounts and try again.";
  }

  // Generic invalid reference (QBO pattern)
  if (detail.includes("Invalid Reference Id")) {
    return `A reference in this ${typeLabel} is no longer valid. Please review your vendor and account selections.`;
  }

  // Stale data / concurrency conflict (QBO code 5010)
  if (error.errorCode === "5010") {
    return "This record was modified since you last loaded it. Please refresh and try again.";
  }

  // Business validation errors (QBO codes 6000, 2050)
  if (error.errorCode === "6000" || error.errorCode === "2050") {
    return `Accounting system rejected this ${typeLabel}: ${detail}`;
  }

  // Auth/token errors
  if (error.statusCode === 401) {
    return "Your accounting connection has expired. Please reconnect in Settings and try again.";
  }

  // Xero: forbidden (wrong scopes or expired token)
  if (error.statusCode === 403) {
    return "Your accounting connection doesn't have the required permissions. Please reconnect in Settings.";
  }

  // Rate limit
  if (error.statusCode === 429) {
    return "Rate limit reached. Please wait a moment and try again.";
  }

  // Fallback with detail if available
  return `Accounting error: ${detail || error.message}`;
}

/**
 * POST /api/invoices/[id]/sync
 *
 * Syncs an approved invoice to the connected accounting provider as a Bill or Purchase.
 * Reads output_type from the invoice record (DB is source of truth).
 * Idempotency: checks sync_log for existing successful sync of the same transaction type.
 * After creation, attaches the source PDF (partial success if attachment fails).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;

  try {
    // 1. Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const syncMemo = `Synced by ${user.email} via Docket`;

    // 2. Get user's org
    const orgId = await getActiveOrgId(supabase, user.id);

    if (!orgId) {
      return authError("No organization found.");
    }

    // 2b. Subscription check
    const access = await checkInvoiceAccess(user.id);
    if (!access.allowed) {
      logger.warn("sync_route_access_denied", {
        action: "sync",
        invoiceId,
        userId: user.id,
        orgId,
        reason: access.reason,
        subscriptionStatus: access.subscriptionStatus,
        trialExhausted: access.trialExhausted,
      });
      return subscriptionRequired("Subscription required to sync invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExhausted: access.trialExhausted,
      });
    }

    const adminSupabase = createAdminClient();

    // 3. Verify the invoice exists and belongs to this org
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) {
      return notFound("Invoice not found.");
    }

    // 4. Verify invoice is approved
    if (invoice.status !== "approved") {
      if (invoice.status === "synced") {
        return conflict("Invoice has already been synced.");
      }
      return validationError(
        `Invoice must be approved before syncing. Current status: ${invoice.status}`
      );
    }

    // Read output_type from invoice record (defaults to 'bill')
    const outputType = (invoice.output_type ?? "bill") as OutputType;
    const isBill = outputType === "bill";
    const transactionType = outputType;
    const providerEntityType: ProviderEntityType = isBill ? "Bill" : "Purchase";

    // 6. Verify accounting connection and get provider
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return validationError("Connect an accounting provider in Settings before syncing.");
    }
    const provider = getAccountingProvider(providerType);

    // 5. Idempotency guard: check for existing successful sync of the same transaction type.
    const { data: existingSync } = await adminSupabase
      .from("sync_log")
      .select("provider_bill_id")
      .eq("invoice_id", invoiceId)
      .eq("provider", providerType)
      .eq("status", "success")
      .eq("transaction_type", transactionType)
      .limit(1)
      .single();

    if (existingSync?.provider_bill_id) {
      logger.info("accounting.sync_idempotent_hit", {
        invoiceId,
        orgId,
        entityId: existingSync.provider_bill_id,
        outputType,
        transactionType,
      });
      return apiSuccess({
        billId: existingSync.provider_bill_id,
        attachmentStatus: "already_synced",
        message: "Invoice was already synced.",
      });
    }

    // 6b. Validate payment_account_id for non-bill types
    if (!isBill && !invoice.payment_account_id) {
      return validationError(
        `Select a payment account for ${OUTPUT_TYPE_LABELS[outputType]} before syncing.`
      );
    }

    // 7. Load extracted data + line items
    const { data: extractedData } = await adminSupabase
      .from("extracted_data")
      .select("*")
      .eq("invoice_id", invoiceId)
      .single();

    if (!extractedData) {
      return validationError("No extracted data found for this invoice.");
    }

    const { data: lineItems } = await adminSupabase
      .from("extracted_line_items")
      .select("*")
      .eq("extracted_data_id", extractedData.id)
      .order("sort_order", { ascending: true });

    // 7b. Duplicate confirmation gate
    const duplicateMatches = extractedData.duplicate_matches as DuplicateMatch[] | null;
    const exactSyncedDuplicates = duplicateMatches?.filter(
      (m) => m.matchType === "exact" && m.status === "synced"
    ) ?? [];

    if (exactSyncedDuplicates.length > 0) {
      const confirmDuplicate = request.headers.get("x-confirm-duplicate") === "true";
      if (!confirmDuplicate) {
        logger.info("sync_duplicate_gate_triggered", {
          invoiceId, orgId, duplicateCount: exactSyncedDuplicates.length,
        });
        return conflict(
          "This invoice may be a duplicate of an already-synced invoice.",
          {
            requiresConfirmation: true,
            duplicates: exactSyncedDuplicates.map((d) => ({
              invoiceId: d.invoiceId,
              vendorName: d.vendorName,
              invoiceNumber: d.invoiceNumber,
            })),
          }
        );
      }
    }

    // 8. Validate required sync fields
    if (!extractedData.vendor_name) {
      return validationError("Vendor name is required before syncing.");
    }

    if (!extractedData.vendor_ref) {
      return validationError(
        "Please select a vendor before syncing."
      );
    }

    if (!lineItems || lineItems.length === 0) {
      return validationError("At least one line item is required before syncing.");
    }

    const unmappedLines = lineItems.filter((li: { gl_account_id: string | null }) => !li.gl_account_id);
    if (unmappedLines.length > 0) {
      return validationError(
        `${unmappedLines.length} line item(s) need a GL account mapped before syncing.`
      );
    }

    // 9. Create transaction via provider abstraction
    const taxTreatment = (invoice.tax_treatment === "exclusive" || invoice.tax_treatment === "inclusive" || invoice.tax_treatment === "no_tax")
      ? invoice.tax_treatment
      : undefined;

    const syncLineItems: SyncLineItem[] = lineItems.map(
      (li: { amount: number; gl_account_id: string; description: string | null; tracking: TrackingAssignment[] | null; tax_code_id: string | null }) => ({
        amount: Number(li.amount),
        glAccountId: li.gl_account_id,
        description: li.description,
        ...(li.tracking?.length ? { tracking: li.tracking } : {}),
        ...(li.tax_code_id ? { taxCodeId: li.tax_code_id } : {}),
      })
    );

    // When the tax toggle is OFF and the invoice has tax, add it as a
    // separate "Sales Tax" line item with auto-inferred GL account.
    // Skip if the user already added a "Sales Tax" line item manually.
    const taxAmount = Number(extractedData.tax_amount) || 0;
    const hasSalesTaxLine = syncLineItems.some(
      (li) => li.description?.toLowerCase().includes("sales tax")
    );
    if (!taxTreatment && taxAmount > 0 && syncLineItems.length > 0 && !hasSalesTaxLine) {
      let taxGlAccountId = syncLineItems[0].glAccountId;
      try {
        const accounts = await provider.fetchAccounts(adminSupabase, orgId);
        const inferred = inferTaxExpenseAccount(accounts);
        if (inferred) {
          taxGlAccountId = inferred;
        }
      } catch (err) {
        logger.warn("accounting.tax_gl_inference_failed", {
          invoiceId,
          orgId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
      syncLineItems.push({
        amount: taxAmount,
        glAccountId: taxGlAccountId,
        description: "Sales Tax",
      });
    }

    let result: TransactionResult;
    let requestInput: unknown;

    try {
      if (isBill) {
        const xeroStatus = (invoice.xero_bill_status === "DRAFT" || invoice.xero_bill_status === "AUTHORISED")
          ? invoice.xero_bill_status
          : undefined;
        const input: CreateBillInput = {
          vendorRef: extractedData.vendor_ref,
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          dueDate: extractedData.due_date,
          invoiceNumber: extractedData.invoice_number,
          xeroStatus,
          taxTreatment,
          memo: syncMemo,
        };
        requestInput = input;
        result = await provider.createBill(adminSupabase, orgId, input);
      } else {
        const input: CreatePurchaseInput = {
          vendorRef: extractedData.vendor_ref,
          paymentAccountRef: invoice.payment_account_id!,
          paymentType: OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">] as "Check" | "Cash" | "CreditCard",
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          invoiceNumber: extractedData.invoice_number,
          taxTreatment,
          memo: syncMemo,
        };
        requestInput = input;
        result = await provider.createPurchase(adminSupabase, orgId, input);
      }

      // Log success in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: providerType,
        provider_bill_id: result.entityId,
        request_payload: requestInput as Record<string, unknown>,
        provider_response: result.providerResponse,
        status: "success",
        transaction_type: transactionType,
        provider_entity_type: result.entityType,
        synced_by: user.id,
      });
    } catch (error) {
      // Log failure in sync_log
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetail = error instanceof AccountingApiError
        ? { code: error.errorCode, element: error.element, detail: error.detail }
        : {};

      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: providerType,
        request_payload: requestInput as Record<string, unknown>,
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
        synced_by: user.id,
      });

      // Update invoice with error
      await adminSupabase
        .from("invoices")
        .update({
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      logger.error("accounting.sync_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        outputType,
        transactionType,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      // Email notification for sync failure (fire-and-forget)
      sendSyncFailureEmail(
        user.id,
        invoiceId,
        invoice.file_name,
        extractedData.vendor_name,
        providerType as "quickbooks" | "xero",
        errorMessage
      );

      if (error instanceof AccountingApiError) {
        const friendlyMessage = translateAccountingError(error, outputType);
        return validationError(friendlyMessage);
      }
      return internalError(`Failed to create ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()}.`);
    }

    // 10. Attach PDF (partial success if this fails)
    let attachmentStatus = "attached";
    try {
      const { data: fileData, error: downloadError } = await adminSupabase
        .storage
        .from("invoices")
        .download(invoice.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      await provider.attachDocument(
        adminSupabase,
        orgId,
        result.entityId,
        result.entityType,
        fileBuffer,
        invoice.file_name
      );
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("accounting.sync_attachment_failed", {
        invoiceId,
        orgId,
        entityId: result.entityId,
        entityType: result.entityType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 11. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("accounting.sync_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      entityId: result.entityId,
      outputType,
      transactionType,
      providerEntityType: result.entityType,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    trackServerEvent(user.id, AnalyticsEvents.INVOICE_SYNCED, { invoiceId });

    // Email notification (fire-and-forget)
    sendSyncSuccessEmail(
      user.id,
      invoiceId,
      invoice.file_name,
      extractedData.vendor_name,
      extractedData.total_amount?.toString() ?? "",
      providerType as "quickbooks" | "xero",
      result.entityId
    );

    return apiSuccess({
      billId: result.entityId,
      transactionType,
      attachmentStatus,
      message: SYNC_SUCCESS_MESSAGES[outputType],
      ...(attachmentStatus === "failed"
        ? {
            warning:
              `${OUTPUT_TYPE_LABELS[outputType]} created but PDF attachment failed. You can attach it manually.`,
          }
        : {}),
    });
  } catch (error) {
    logger.error("accounting.sync_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred during sync.");
  }
}
