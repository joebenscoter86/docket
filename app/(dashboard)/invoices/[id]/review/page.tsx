import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractedData } from "@/lib/extraction/data";
import { logger } from "@/lib/utils/logger";
import ReviewLayout from "@/components/invoices/ReviewLayout";
import ReviewProcessingState from "@/components/invoices/ReviewProcessingState";
import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types/invoice";

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
    .select("id, status, file_path, file_name, file_type, error_message")
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

  // If still processing or errored, show processing state
  if (PROCESSING_STATUSES.includes(invoice.status as InvoiceStatus)) {
    return (
      <ReviewProcessingState
        invoiceId={invoice.id}
        initialStatus={invoice.status as InvoiceStatus}
      />
    );
  }

  // Fetch extracted data and signed URL in parallel
  // Admin client required for Storage — bucket RLS restricts anon access
  const admin = createAdminClient();
  const [extractedData, signedUrlResult] = await Promise.all([
    getExtractedData(invoice.id),
    admin.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600),
  ]);

  // Guard: signed URL failure
  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    logger.error("review_page_signed_url_failed", {
      invoiceId: invoice.id,
      filePath: invoice.file_path,
      error: signedUrlResult.error?.message ?? "no signed URL",
      status: "error",
    });
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-500">
        <p>Could not load document. The file may have been deleted.</p>
        <Link
          href="/invoices"
          className="mt-3 text-blue-600 hover:text-blue-700"
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
      }}
      signedUrl={signedUrlResult.data.signedUrl}
      // getExtractedData returns Supabase-inferred types where confidence_score
      // is string | null. The DB CHECK constraint guarantees valid values.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractedData={extractedData as any}
    />
  );
}
