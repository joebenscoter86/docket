import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeForMatching } from "@/lib/utils/normalize";
import type { DuplicateMatch } from "@/lib/types/invoice";

export async function checkContentDuplicates(params: {
  admin: SupabaseClient;
  invoiceId: string;
  orgId: string;
  vendorName: string;
  invoiceNumber: string | null;
  totalAmount: number | null;
  invoiceDate: string | null;
}): Promise<DuplicateMatch[]> {
  const {
    admin,
    invoiceId,
    orgId,
    vendorName,
    invoiceNumber,
    totalAmount,
    invoiceDate,
  } = params;

  const normalizedVendor = normalizeForMatching(vendorName);

  const { data: candidates, error } = await admin
    .from("extracted_data")
    .select(
      "invoice_id, vendor_name, invoice_number, total_amount, invoice_date, invoices!inner(id, org_id, status, file_name)"
    )
    .neq("invoice_id", invoiceId)
    .not("vendor_name", "is", null);

  if (error || !candidates) {
    return [];
  }

  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    const inv = candidate.invoices as unknown as {
      id: string;
      org_id: string;
      status: string;
      file_name: string;
    };

    // Filter to same org and exclude errored invoices
    if (inv.org_id !== orgId || inv.status === "error") {
      continue;
    }

    const candidateVendor = normalizeForMatching(candidate.vendor_name ?? "");

    // Exact match: same vendor + same invoice number
    if (
      candidateVendor === normalizedVendor &&
      invoiceNumber &&
      candidate.invoice_number &&
      candidate.invoice_number.trim() === invoiceNumber.trim()
    ) {
      matches.push({
        invoiceId: candidate.invoice_id,
        matchType: "exact",
        vendorName: candidate.vendor_name ?? "",
        invoiceNumber: candidate.invoice_number,
        totalAmount: candidate.total_amount,
        invoiceDate: candidate.invoice_date,
        status: inv.status,
        fileName: inv.file_name,
      });
      continue;
    }

    // Likely match: same vendor + same total + same date
    if (
      candidateVendor === normalizedVendor &&
      totalAmount != null &&
      candidate.total_amount != null &&
      candidate.total_amount === totalAmount &&
      invoiceDate &&
      candidate.invoice_date &&
      candidate.invoice_date === invoiceDate
    ) {
      matches.push({
        invoiceId: candidate.invoice_id,
        matchType: "likely",
        vendorName: candidate.vendor_name ?? "",
        invoiceNumber: candidate.invoice_number,
        totalAmount: candidate.total_amount,
        invoiceDate: candidate.invoice_date,
        status: inv.status,
        fileName: inv.file_name,
      });
    }
  }

  // Sort exact matches first, then limit to 5
  matches.sort((a, b) => {
    if (a.matchType === "exact" && b.matchType !== "exact") return -1;
    if (a.matchType !== "exact" && b.matchType === "exact") return 1;
    return 0;
  });

  return matches.slice(0, 5);
}
