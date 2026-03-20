import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
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
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";
import type { OutputType, ProviderEntityType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE, OUTPUT_TYPE_LABELS, SYNC_SUCCESS_MESSAGES } from "@/lib/types/invoice";

/**
 * Translate QBO API errors into user-friendly messages.
 * Maps common error codes and patterns to actionable guidance.
 */
function translateQBOError(error: QBOApiError, outputType: OutputType): string {
  const typeLabel = OUTPUT_TYPE_LABELS[outputType].toLowerCase();
  const detail = error.detail ?? "";

  // Duplicate document number
  if (detail.includes("Duplicate") || error.errorCode === "6140") {
    return `A ${typeLabel} with this invoice number already exists in QuickBooks. Change the invoice number and try again.`;
  }

  // Vendor/entity not found
  if (
    detail.includes("Invalid Reference Id") &&
    (error.element === "VendorRef" || error.element === "EntityRef")
  ) {
    return "The selected vendor was not found in QuickBooks. They may have been deleted. Please select a different vendor or create one in QuickBooks first.";
  }

  // GL account not found
  if (
    detail.includes("Invalid Reference Id") &&
    error.element === "AccountRef"
  ) {
    return "One or more GL accounts are no longer valid in QuickBooks. Please re-map the line item accounts and try again.";
  }

  // Generic invalid reference
  if (detail.includes("Invalid Reference Id")) {
    return `A reference in this ${typeLabel} is no longer valid in QuickBooks. Please review your vendor and account selections.`;
  }

  // Stale data / concurrency conflict
  if (error.errorCode === "5010") {
    return "This record was modified in QuickBooks since you last loaded it. Please refresh and try again.";
  }

  // Business validation errors
  if (error.errorCode === "6000" || error.errorCode === "2050") {
    return `QuickBooks rejected this ${typeLabel}: ${detail}`;
  }

  // Auth/token errors
  if (error.statusCode === 401) {
    return "Your QuickBooks connection has expired. Please reconnect in Settings and try again.";
  }

  // Rate limit
  if (error.statusCode === 429) {
    return "QuickBooks rate limit reached. Please wait a moment and try again.";
  }

  // Fallback with detail if available
  return `QuickBooks error: ${detail || error.message}`;
}

/**
 * POST /api/invoices/[id]/sync
 *
 * Syncs an approved invoice to QBO as a Bill or Purchase (Check/Cash/CreditCard).
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

    // 2. Get user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    const orgId = membership.org_id;

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
        trialExpired: access.trialExpired,
      });
      return subscriptionRequired("Subscription required to sync invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
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
        return conflict("Invoice has already been synced to QuickBooks.");
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

    // 5. Idempotency guard: check for existing successful sync of the same transaction type.
    // The UI locks the output_type selector once an invoice is synced, so dual-sync
    // (e.g., Bill + Check for the same invoice) cannot happen today. The transaction_type
    // filter is future-proofing — if we ever allow re-syncing as a different type, it's
    // already correct.
    const { data: existingSync } = await adminSupabase
      .from("sync_log")
      .select("provider_bill_id")
      .eq("invoice_id", invoiceId)
      .eq("provider", "quickbooks")
      .eq("status", "success")
      .eq("transaction_type", transactionType)
      .limit(1)
      .single();

    if (existingSync?.provider_bill_id) {
      logger.info("qbo.sync_idempotent_hit", {
        invoiceId,
        orgId,
        // provider_bill_id is a legacy column name — for non-bill syncs, it holds the Purchase ID
        entityId: existingSync.provider_bill_id,
        outputType,
        transactionType,
      });
      return apiSuccess({
        billId: existingSync.provider_bill_id,
        attachmentStatus: "already_synced",
        message: "Invoice was already synced to QuickBooks.",
      });
    }

    // 6. Verify QBO connection exists
    const connected = await isConnected(adminSupabase, orgId);
    if (!connected) {
      return validationError("Connect QuickBooks in Settings before syncing.");
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

    // 8. Validate required sync fields
    if (!extractedData.vendor_name) {
      return validationError("Vendor name is required before syncing.");
    }

    if (!extractedData.vendor_ref) {
      return validationError(
        "Please select a QuickBooks vendor before syncing."
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

    // 9. Create transaction in QBO (Bill or Purchase)
    // provider_bill_id is a legacy column name — for non-bill syncs, it holds the Purchase ID.
    // Accept this naming debt; renaming would require updating all existing queries.
    let entityId: string;
    let requestPayload: unknown;
    let responsePayload: unknown;

    try {
      if (isBill) {
        // ─── Bill flow (existing, unchanged) ───
        const billLines: QBOBillLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
          DetailType: "AccountBasedExpenseLineDetail" as const,
          Amount: Number(li.amount),
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: li.gl_account_id },
          },
          ...(li.description ? { Description: li.description } : {}),
        }));

        const billPayload: QBOBillPayload = {
          VendorRef: { value: extractedData.vendor_ref },
          Line: billLines,
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.due_date ? { DueDate: extractedData.due_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = billPayload;
        const billResponse = await createBill(adminSupabase, orgId, billPayload);
        entityId = billResponse.Bill.Id;
        responsePayload = billResponse;
      } else {
        // ─── Purchase flow (Check/Cash/CreditCard) ───
        const purchaseLines: QBOPurchaseLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
          Amount: Number(li.amount),
          DetailType: "AccountBasedExpenseLineDetail" as const,
          Description: li.description ?? undefined,
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: li.gl_account_id },
          },
        }));

        const paymentType = OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">];

        const purchasePayload: QBOPurchasePayload = {
          PaymentType: paymentType as "Check" | "Cash" | "CreditCard",
          AccountRef: { value: invoice.payment_account_id! },
          EntityRef: { value: extractedData.vendor_ref, type: "Vendor" },
          Line: purchaseLines,
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = purchasePayload;
        const purchaseResponse = await createPurchase(adminSupabase, orgId, purchasePayload);
        entityId = purchaseResponse.Purchase.Id;
        responsePayload = purchaseResponse;
      }

      // Log success in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        provider_bill_id: entityId,
        request_payload: requestPayload as Record<string, unknown>,
        provider_response: responsePayload as Record<string, unknown>,
        status: "success",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
      });
    } catch (error) {
      // Log failure in sync_log
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetail = error instanceof QBOApiError
        ? { code: error.errorCode, element: error.element, detail: error.detail, faultType: error.faultType }
        : {};

      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        request_payload: requestPayload as Record<string, unknown>,
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
      });

      // Update invoice with error
      await adminSupabase
        .from("invoices")
        .update({
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      logger.error("qbo.sync_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        outputType,
        transactionType,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      if (error instanceof QBOApiError) {
        const friendlyMessage = translateQBOError(error, outputType);
        return validationError(friendlyMessage);
      }
      return internalError(`Failed to create ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()} in QuickBooks.`);
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
      await attachPdfToEntity(
        adminSupabase,
        orgId,
        entityId,
        providerEntityType,
        fileBuffer,
        invoice.file_name
      );
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("qbo.sync_attachment_failed", {
        invoiceId,
        orgId,
        entityId,
        entityType: providerEntityType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 11. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("qbo.sync_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      entityId,
      outputType,
      transactionType,
      providerEntityType,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    trackServerEvent(user.id, AnalyticsEvents.INVOICE_SYNCED, { invoiceId });

    return apiSuccess({
      billId: entityId,
      attachmentStatus,
      message: SYNC_SUCCESS_MESSAGES[outputType],
      ...(attachmentStatus === "failed"
        ? {
            warning:
              `${OUTPUT_TYPE_LABELS[outputType]} created but PDF attachment failed. You can attach it manually in QuickBooks.`,
          }
        : {}),
    });
  } catch (error) {
    logger.error("qbo.sync_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred during sync.");
  }
}
