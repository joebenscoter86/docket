import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { validateListParams, fetchInvoiceList, fetchInvoiceCounts } from "@/lib/invoices/queries";
import InvoiceList from "@/components/invoices/InvoiceList";

interface InvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    limit?: string;
  }>;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const params = validateListParams({
    status: resolvedParams.status,
    sort: resolvedParams.sort,
    direction: resolvedParams.direction,
    cursor: resolvedParams.cursor,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : undefined,
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Invoices</h1>
      </div>
      <InvoiceList
        invoices={listResult.invoices}
        counts={counts}
        nextCursor={listResult.nextCursor}
        currentStatus={params.status}
        currentSort={params.sort}
        currentDirection={params.direction}
        hasCursor={!!resolvedParams.cursor}
      />
    </div>
  );
}
