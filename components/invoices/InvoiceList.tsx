"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import Button from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";

interface InvoiceListProps {
  invoices: InvoiceListItem[];
  counts: InvoiceListCounts;
  nextCursor: string | null;
  currentStatus: string;
  currentSort: string;
  currentDirection: string;
  hasCursor: boolean;
}

const FILTER_TABS: { key: keyof InvoiceListCounts; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "synced", label: "Synced" },
  { key: "error", label: "Error" },
];

const SORT_OPTIONS = [
  { value: "uploaded_at", label: "Uploaded Date" },
  { value: "invoice_date", label: "Invoice Date" },
  { value: "vendor_name", label: "Vendor" },
  { value: "total_amount", label: "Amount" },
];

function buildUrl(
  pathname: string,
  currentParams: URLSearchParams,
  overrides: Record<string, string | undefined>
) {
  const params = new URLSearchParams(currentParams.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "\u2014";
  // Append T00:00:00 so date-only strings (YYYY-MM-DD) are parsed as local time,
  // not UTC — prevents off-by-one day in US timezones.
  const date = new Date(dateString.includes("T") ? dateString : `${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InvoiceList({
  invoices,
  counts,
  nextCursor,
  currentStatus,
  currentSort,
  currentDirection,
  hasCursor,
}: InvoiceListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Empty state: no invoices at all
  if (counts.all === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted text-sm mb-4">
          No invoices yet. Upload your first invoice to get started.
        </p>
        <Link href="/upload">
          <Button variant="primary">Upload Invoice</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {FILTER_TABS.map((tab) => {
          const isActive = currentStatus === tab.key;
          const count = counts[tab.key];

          // Dot color per status
          const dotColors: Record<string, string> = {
            pending_review: 'bg-warning',
            approved: 'bg-primary',
            synced: 'bg-accent',
            error: 'bg-error',
          };

          return (
            <Link
              key={tab.key}
              href={buildUrl(pathname, searchParams, {
                status: tab.key === "all" ? undefined : tab.key,
                cursor: undefined,
              })}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 ease-in-out ${
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "bg-surface text-text border border-border hover:border-primary/30"
              }`}
            >
              {tab.key !== 'all' && (
                <span className={`h-2 w-2 rounded-full ${
                  isActive ? 'bg-white/70' : (dotColors[tab.key] || 'bg-muted')
                }`} />
              )}
              {tab.label}
              <span className={`text-xs font-bold ${
                isActive ? "text-white/80" : "text-muted"
              }`}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="sort-select" className="text-sm text-muted">
          Sort by:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => {
            router.push(buildUrl(pathname, searchParams, {
              sort: e.target.value,
              cursor: undefined,
            }));
          }}
          className="border border-border rounded-md px-2 py-1 text-sm text-text"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Link
          href={buildUrl(pathname, searchParams, {
            direction: currentDirection === "desc" ? "asc" : "desc",
            cursor: undefined,
          })}
          className="p-1 text-muted hover:text-text"
          aria-label={`Sort ${currentDirection === "desc" ? "ascending" : "descending"}`}
        >
          {currentDirection === "desc" ? "\u2193" : "\u2191"}
        </Link>
      </div>

      {/* Filter empty state */}
      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted text-sm">No invoices match this filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">File Name</th>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Vendor</th>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Invoice #</th>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Invoice Date</th>
                  <th className="text-right text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Amount</th>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Status</th>
                  <th className="text-left text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group cursor-pointer" onClick={() => router.push(`/invoices/${invoice.id}/review`)}>
                    <td className="py-3.5 px-3 text-[14px] text-text truncate max-w-[200px]">
                      {invoice.file_name}
                    </td>
                    <td className="py-3.5 px-3 text-[14px] font-medium text-text">
                      {invoice.extracted_data?.vendor_name ?? (
                        <span className="text-muted">Pending</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[13px] text-[#475569]">
                      {invoice.extracted_data?.invoice_number ?? "\u2014"}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[13px] text-[#475569]">
                      {formatDate(invoice.extracted_data?.invoice_date ?? null)}
                    </td>
                    <td className="py-3.5 px-3 text-[14px] text-right font-mono">
                      {invoice.extracted_data?.total_amount != null
                        ? formatCurrency(invoice.extracted_data.total_amount, null)
                        : "\u2014"}
                    </td>
                    <td className="py-3.5 px-3">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="py-3.5 px-3 text-[14px] text-muted">
                      {formatRelativeTime(invoice.uploaded_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}/review`}
                className="block bg-surface border border-border rounded-lg p-4 hover:border-primary/30 transition-all duration-150"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text truncate max-w-[200px]">
                    {invoice.file_name}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="text-sm text-muted mb-1">
                  {invoice.extracted_data?.vendor_name ?? (
                    <span className="text-muted">Pending</span>
                  )}
                  {invoice.extracted_data?.invoice_number && (
                    <span className="text-muted ml-2 font-mono text-[13px]">
                      #{invoice.extracted_data.invoice_number}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">
                    {invoice.extracted_data?.total_amount != null
                      ? formatCurrency(invoice.extracted_data.total_amount, null)
                      : "\u2014"}
                  </span>
                  <span className="text-muted text-xs">
                    {formatRelativeTime(invoice.uploaded_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#F1F5F9]">
            <div className="text-[13px] text-muted">
              Showing {invoices.length} of {counts[currentStatus as keyof InvoiceListCounts] ?? counts.all} invoices
              {hasCursor && " \u00b7 Page 2+"}
            </div>
            <div className="flex gap-2">
              {hasCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: undefined })}
                >
                  <Button variant="outline">Previous</Button>
                </Link>
              )}
              {nextCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: nextCursor })}
                >
                  <Button variant="outline">Next</Button>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
