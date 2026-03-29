import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractedData } from "@/lib/extraction/data";
import { getOrgConnection } from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import ReviewLayout from "@/components/invoices/ReviewLayout";
import ReviewProcessingState from "@/components/invoices/ReviewProcessingState";
import { BatchNavigation } from "@/components/invoices/BatchNavigation";
import Link from "next/link";
import type { InvoiceStatus, ExtractedDataRow, OutputType } from "@/lib/types/invoice";
import type { AccountingProviderType } from "@/lib/accounting/types";
import { fetchBatchManifest, type BatchManifestItem } from "@/lib/invoices/queries";

const PROCESSING_STATUSES: InvoiceStatus[] = ["uploading", "extracting", "error"];

export default async function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Fetch invoice row
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, file_path, file_name, file_type, error_message, output_type, payment_account_id, payment_account_name, batch_id, xero_bill_status")
    .eq("id", params.id)
    .single();

  if (invoiceError || !invoice) {
    logger.warn("review_page_invoice_not_found", {
      invoiceId: params.id,
      error: invoiceError?.message ?? "not found",
      status: "error",
    });
    redirect("/invoices");
  }

  // Fetch batch manifest if this is a batch invoice
  let batchManifest: BatchManifestItem[] = [];
  if (invoice.batch_id) {
    batchManifest = await fetchBatchManifest(supabase, invoice.batch_id);
  }

  // If still processing or errored, show processing state
  if (PROCESSING_STATUSES.includes(invoice.status as InvoiceStatus)) {
    return (
      <>
        {invoice.batch_id && batchManifest.length > 1 && (
          <BatchNavigation
            currentInvoiceId={invoice.id}
            batchId={invoice.batch_id}
            initialManifest={batchManifest}
          />
        )}
        <ReviewProcessingState
          invoiceId={invoice.id}
          initialStatus={invoice.status as InvoiceStatus}
        />
      </>
    );
  }

  // Fetch extracted data, signed URL, org defaults, and accounting provider in parallel
  // Admin client required for Storage — bucket RLS restricts anon access
  const admin = createAdminClient();
  const [extractedData, signedUrlResult, orgAndProviderResult] = await Promise.all([
    getExtractedData(invoice.id),
    admin.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600),
    supabase
      .from("org_memberships")
      .select("org_id")
      .limit(1)
      .single()
      .then(async ({ data: membership }) => {
        if (!membership) return { org: null, provider: null as AccountingProviderType | null };
        const [orgData, connection] = await Promise.all([
          admin
            .from("organizations")
            .select("default_output_type, default_payment_account_id, default_payment_account_name")
            .eq("id", membership.org_id)
            .single()
            .then(({ data }) => data),
          getOrgConnection(admin, membership.org_id),
        ]);
        return { org: orgData, provider: connection?.provider ?? null };
      }),
  ]);

  const orgResult = orgAndProviderResult?.org ?? null;
  const accountingProvider = orgAndProviderResult?.provider ?? null;

  // Guard: signed URL failure
  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    logger.error("review_page_signed_url_failed", {
      invoiceId: invoice.id,
      filePath: invoice.file_path,
      error: signedUrlResult.error?.message ?? "no signed URL",
      status: "error",
    });
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-muted">
        <p>Could not load document. The file may have been deleted.</p>
        <Link
          href="/invoices"
          className="mt-3 text-primary hover:text-primary-hover"
        >
          Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <ReviewLayout
      invoice={{
          id: invoice.id,
          fileName: invoice.file_name,
          fileType: invoice.file_type,
          status: invoice.status as InvoiceStatus,
          errorMessage: invoice.error_message,
          outputType: (invoice.output_type ?? "bill") as OutputType,
          paymentAccountId: invoice.payment_account_id ?? null,
          paymentAccountName: invoice.payment_account_name ?? null,
          batchId: invoice.batch_id ?? null,
          xeroBillStatus: (invoice.xero_bill_status === "DRAFT" || invoice.xero_bill_status === "AUTHORISED")
            ? invoice.xero_bill_status
            : null,
        }}
        signedUrl={signedUrlResult.data.signedUrl}
        // getExtractedData returns Supabase-inferred types where confidence_score
        // is string | null. The DB CHECK constraint guarantees valid values.
        extractedData={extractedData as unknown as ExtractedDataRow}
        orgDefaults={{
          defaultOutputType: (orgResult?.default_output_type ?? "bill") as OutputType,
          defaultPaymentAccountId: orgResult?.default_payment_account_id ?? null,
          defaultPaymentAccountName: orgResult?.default_payment_account_name ?? null,
        }}
        batchManifest={batchManifest}
        accountingProvider={accountingProvider}
      />
  );
}
