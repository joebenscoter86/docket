import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { validateListParams, fetchInvoiceList, fetchInvoiceCounts } from "@/lib/invoices/queries";
import { isOrgConnected } from "@/lib/accounting";
import InvoiceList from "@/components/invoices/InvoiceList";
import Button from "@/components/ui/Button";

interface InvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    limit?: string;
    output_type?: string;
    batch_id?: string;
    toast?: string;
    date_field?: string;
    date_preset?: string;
    date_from?: string;
    date_to?: string;
  }>;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const toastMessage =
    resolvedParams.toast === "all-reviewed" ? "All invoices reviewed!" : null;

  // Fetch org for accounting connection check
  const orgId = await getActiveOrgId(supabase, user.id);

  const isAccountingConnected = orgId
    ? await isOrgConnected(createAdminClient(), orgId)
    : false;

  const params = validateListParams({
    status: resolvedParams.status,
    sort: resolvedParams.sort,
    direction: resolvedParams.direction,
    cursor: resolvedParams.cursor,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : undefined,
    output_type: resolvedParams.output_type,
    batch_id: resolvedParams.batch_id,
    date_field: resolvedParams.date_field,
    date_preset: resolvedParams.date_preset,
    date_from: resolvedParams.date_from,
    date_to: resolvedParams.date_to,
  });

  const [listResult, counts] = await Promise.all([
    fetchInvoiceList(supabase, params),
    fetchInvoiceCounts(supabase),
  ]);

  // If the RPC for counts failed but we actually have invoices,
  // ensure counts.all reflects reality so the empty state doesn't hide data.
  if (counts.all === 0 && listResult.invoices.length > 0) {
    counts.all = listResult.invoices.length;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Invoices</h1>
          <p className="font-body text-[15px] text-muted mt-1">Manage and sync extracted document data.</p>
        </div>
        <Link href="/upload">
          <Button variant="primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload New
          </Button>
        </Link>
      </div>
      {resolvedParams.batch_id && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span>Showing batch upload results</span>
          <Link href="/invoices" className="text-blue-600 hover:underline">
            View all invoices
          </Link>
        </div>
      )}
      <InvoiceList
        invoices={listResult.invoices}
        counts={counts}
        nextCursor={listResult.nextCursor}
        currentStatus={params.status}
        currentSort={params.sort}
        currentDirection={params.direction}
        hasCursor={!!resolvedParams.cursor}
        currentOutputType={params.output_type}
        currentBatchId={resolvedParams.batch_id}
        toastMessage={toastMessage}
        isAccountingConnected={isAccountingConnected}
        currentDateField={params.date_field}
        currentDatePreset={params.date_preset}
        currentDateFrom={params.date_from}
        currentDateTo={params.date_to}
      />
    </div>
  );
}
