import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { createBill, attachPdfToBill, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  notFound,
  conflict,
  validationError,
  apiSuccess,
  internalError,
  subscriptionRequired,
} from "@/lib/utils/errors";
import type { QBOBillPayload, QBOBillLine } from "@/lib/quickbooks/types";

/**
 * POST /api/invoices/[id]/sync
 *
 * Syncs an approved invoice to QBO as a Bill.
 * Idempotency: checks sync_log for existing successful sync before calling QBO.
 * After bill creation, attaches the source PDF (partial success if attachment fails).
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

    // 5. Idempotency guard: check for existing successful sync
    const { data: existingSync } = await adminSupabase
      .from("sync_log")
      .select("provider_bill_id")
      .eq("invoice_id", invoiceId)
      .eq("provider", "quickbooks")
      .eq("status", "success")
      .limit(1)
      .single();

    if (existingSync?.provider_bill_id) {
      logger.info("qbo.sync_idempotent_hit", {
        invoiceId,
        orgId,
        billId: existingSync.provider_bill_id,
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

    // Check for vendor_ref (QBO vendor ID) — user must select from dropdown
    if (!extractedData.vendor_ref) {
      return validationError(
        "Please select a QuickBooks vendor before syncing."
      );
    }

    if (!lineItems || lineItems.length === 0) {
      return validationError("At least one line item is required before syncing.");
    }

    // Verify all line items have a GL account mapped
    const unmappedLines = lineItems.filter((li: { gl_account_id: string | null }) => !li.gl_account_id);
    if (unmappedLines.length > 0) {
      return validationError(
        `${unmappedLines.length} line item(s) need a GL account mapped before syncing.`
      );
    }

    // 9. Build QBO bill payload
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
      ...(extractedData.invoice_date
        ? { TxnDate: extractedData.invoice_date }
        : {}),
      ...(extractedData.due_date
        ? { DueDate: extractedData.due_date }
        : {}),
      ...(extractedData.invoice_number
        ? { DocNumber: extractedData.invoice_number }
        : {}),
    };

    // 10. Create bill in QBO
    let billId: string;
    try {
      const billResponse = await createBill(adminSupabase, orgId, billPayload);
      billId = billResponse.Bill.Id;

      // Log success in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        provider_bill_id: billId,
        request_payload: billPayload as unknown as Record<string, unknown>,
        provider_response: billResponse as unknown as Record<string, unknown>,
        status: "success",
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
        request_payload: billPayload as unknown as Record<string, unknown>,
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
      });

      // Update invoice with error
      await adminSupabase
        .from("invoices")
        .update({
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      logger.error("qbo.sync_bill_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      if (error instanceof QBOApiError) {
        // Surface duplicate DocNumber errors clearly
        if (error.detail?.includes("Duplicate")) {
          return validationError(
            `A bill with this invoice number already exists in QuickBooks. ${error.detail}`
          );
        }
        return validationError(`QuickBooks error: ${error.detail}`);
      }
      return internalError("Failed to create bill in QuickBooks.");
    }

    // 11. Attach PDF (partial success if this fails)
    let attachmentStatus = "attached";
    try {
      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await adminSupabase
        .storage
        .from("invoices")
        .download(invoice.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      await attachPdfToBill(
        adminSupabase,
        orgId,
        billId,
        fileBuffer,
        invoice.file_name
      );
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("qbo.sync_attachment_failed", {
        invoiceId,
        orgId,
        billId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't fail the sync — bill was created successfully
    }

    // 12. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("qbo.sync_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      billId,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      billId,
      attachmentStatus,
      ...(attachmentStatus === "failed"
        ? {
            warning:
              "Bill created but PDF attachment failed. You can attach it manually in QuickBooks.",
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
