"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
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
  return new Date(dateString).toLocaleDateString("en-US", {
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
        <p className="text-gray-500 text-sm mb-4">
          No invoices yet. Upload your first invoice to get started.
        </p>
        <Link
          href="/upload"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700"
        >
          Upload Invoice
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {FILTER_TABS.map((tab) => {
          const isActive = currentStatus === tab.key;
          const count = counts[tab.key];
          const isPendingReview = tab.key === "pending_review" && count > 0;

          return (
            <Link
              key={tab.key}
              href={buildUrl(pathname, searchParams, {
                status: tab.key === "all" ? undefined : tab.key,
                cursor: undefined,
              })}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isPendingReview
                    ? "bg-blue-600 text-white"
                    : isActive
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="sort-select" className="text-sm text-gray-500">
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
          className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700"
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
          className="p-1 text-gray-500 hover:text-gray-700"
          aria-label={`Sort ${currentDirection === "desc" ? "ascending" : "descending"}`}
        >
          {currentDirection === "desc" ? "\u2193" : "\u2191"}
        </Link>
      </div>

      {/* Filter empty state */}
      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">No invoices match this filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">File Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                    <td colSpan={7} className="p-0">
                      <Link
                        href={`/invoices/${invoice.id}/review`}
                        className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] w-full"
                      >
                        <span className="py-3 px-4 text-sm text-slate-800 truncate max-w-[200px]">
                          {invoice.file_name}
                        </span>
                        <span className="py-3 px-4 text-sm">
                          {invoice.extracted_data?.vendor_name ?? (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </span>
                        <span className="py-3 px-4 text-sm font-mono text-gray-600">
                          {invoice.extracted_data?.invoice_number ?? "\u2014"}
                        </span>
                        <span className="py-3 px-4 text-sm text-gray-600">
                          {formatDate(invoice.extracted_data?.invoice_date ?? null)}
                        </span>
                        <span className="py-3 px-4 text-sm text-right font-mono">
                          {invoice.extracted_data?.total_amount != null
                            ? formatCurrency(invoice.extracted_data.total_amount, null)
                            : "\u2014"}
                        </span>
                        <span className="py-3 px-4">
                          <InvoiceStatusBadge status={invoice.status} />
                        </span>
                        <span className="py-3 px-4 text-sm text-gray-500">
                          {formatRelativeTime(invoice.uploaded_at)}
                        </span>
                      </Link>
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
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]">
                    {invoice.file_name}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="text-sm text-gray-600 mb-1">
                  {invoice.extracted_data?.vendor_name ?? (
                    <span className="text-gray-400">Pending</span>
                  )}
                  {invoice.extracted_data?.invoice_number && (
                    <span className="text-gray-400 ml-2 font-mono">
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
                  <span className="text-gray-400 text-xs">
                    {formatRelativeTime(invoice.uploaded_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              {counts[currentStatus as keyof InvoiceListCounts] ?? counts.all} total
              {hasCursor && " \u00b7 Page 2+"}
            </div>
            <div className="flex gap-2">
              {hasCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: undefined })}
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium text-sm"
                >
                  Previous page
                </Link>
              )}
              {nextCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: nextCursor })}
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium text-sm"
                >
                  Next page
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
