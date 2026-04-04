"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";
import { TRANSACTION_TYPE_SHORT_LABELS, OutputType } from "@/lib/types/invoice";
import { groupInvoicesByBatch, type InvoiceRow } from "@/lib/invoices/batch-utils";
import { useInvoiceStatuses } from "@/lib/hooks/useInvoiceStatuses";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import BatchHeader from "./BatchHeader";
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
  currentOutputType: string;
  currentBatchId?: string;
  toastMessage?: string | null;
  isAccountingConnected?: boolean;
  currentDateField?: string;
  currentDatePreset?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
}

const STAT_PILLS: { status: keyof InvoiceListCounts; label: (count: number) => string; dot: string; bg: string; border: string; text: string }[] = [
  { status: "pending_review", label: (n) => `${n} need review`, dot: "bg-[#EA580C]", bg: "bg-[#FFF7ED]", border: "border-[#FED7AA]", text: "text-[#EA580C]" },
  { status: "approved", label: (n) => `${n} ready to sync`, dot: "bg-[#2563EB]", bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", text: "text-[#2563EB]" },
  { status: "error", label: (n) => `${n} error${n !== 1 ? "s" : ""}`, dot: "bg-[#DC2626]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", text: "text-[#DC2626]" },
  { status: "synced", label: (n) => `${n} synced`, dot: "bg-[#059669]", bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]", text: "text-[#059669]" },
];

const SORT_LABELS: { value: string; label: string; sort: string; direction: string }[] = [
  { value: "newest", label: "Newest", sort: "uploaded_at", direction: "desc" },
  { value: "oldest", label: "Oldest", sort: "uploaded_at", direction: "asc" },
  { value: "vendor-az", label: "Vendor A-Z", sort: "vendor_name", direction: "asc" },
  { value: "vendor-za", label: "Vendor Z-A", sort: "vendor_name", direction: "desc" },
  { value: "amount-high", label: "Amount: High-Low", sort: "total_amount", direction: "desc" },
  { value: "amount-low", label: "Amount: Low-High", sort: "total_amount", direction: "asc" },
];

const TYPE_FILTER_CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bill", label: "Bill" },
  { key: "check", label: "Check" },
  { key: "cash", label: "Expense" },
  { key: "credit_card", label: "Credit Card" },
];

const DATE_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "uploaded_at", label: "Upload Date" },
  { key: "invoice_date", label: "Invoice Date" },
];

const DATE_PRESET_OPTIONS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
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
  // not UTC -- prevents off-by-one day in US timezones.
  const date = new Date(dateString.includes("T") ? dateString : `${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Determine batch-level empty state message, if applicable */
function getBatchEmptyState(
  invoices: InvoiceListItem[]
): { message: string; color: string; icon?: "check" } | null {
  if (invoices.length === 0) return null;

  const allError = invoices.every((inv) => inv.status === "error");
  if (allError) {
    return {
      message: "All extractions failed. Check file quality and retry.",
      color: "#991B1B",
    };
  }

  const allSynced = invoices.every((inv) => inv.status === "synced");
  if (allSynced) {
    return {
      message: "Batch complete \u2014 all invoices synced.",
      color: "#065F46",
      icon: "check",
    };
  }

  const allApprovedOrSynced = invoices.every(
    (inv) => inv.status === "approved" || inv.status === "synced"
  );
  if (allApprovedOrSynced && !allSynced) {
    return {
      message: "All invoices reviewed! Ready to sync.",
      color: "#1D4ED8",
    };
  }

  return null;
}

export default function InvoiceList({
  invoices,
  counts,
  nextCursor,
  currentStatus,
  currentSort,
  currentDirection,
  hasCursor,
  currentOutputType,
  currentBatchId,
  toastMessage,
  isAccountingConnected,
  currentDateField,
  currentDatePreset,
  currentDateFrom,
  currentDateTo,
}: InvoiceListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Local state overlays Realtime updates onto server-rendered data
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  // Merge server data with Realtime overrides
  const mergedInvoices = useMemo(
    () =>
      invoices.map((inv) => ({
        ...inv,
        status: (statusOverrides[inv.id] as InvoiceListItem["status"]) ?? inv.status,
      })),
    [invoices, statusOverrides]
  );

  // Client-side search filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return mergedInvoices;
    const q = searchQuery.toLowerCase();
    return mergedInvoices.filter((inv) => {
      const vendor = inv.extracted_data?.vendor_name?.toLowerCase() ?? "";
      const invNum = inv.extracted_data?.invoice_number?.toLowerCase() ?? "";
      const fileName = inv.file_name.toLowerCase();
      return vendor.includes(q) || invNum.includes(q) || fileName.includes(q);
    });
  }, [mergedInvoices, searchQuery]);

  // Group into batch rows
  const rows = useMemo(() => groupInvoicesByBatch(filteredInvoices), [filteredInvoices]);

  // Collect IDs needing Realtime subscription (uploaded/extracting)
  const realtimeIds = useMemo(
    () =>
      invoices
        .filter((inv) =>
          ["uploaded", "extracting"].includes(
            (statusOverrides[inv.id] as string) ?? inv.status
          )
        )
        .map((inv) => inv.id),
    [invoices, statusOverrides]
  );

  const { statuses: realtimeStatuses } = useInvoiceStatuses(realtimeIds);

  // Merge Realtime status updates into overrides
  useEffect(() => {
    const newOverrides: Record<string, string> = {};
    for (const [id, entry] of Object.entries(realtimeStatuses)) {
      newOverrides[id] = entry.status;
    }
    if (Object.keys(newOverrides).length > 0) {
      setStatusOverrides((prev) => ({ ...prev, ...newOverrides }));
    }
  }, [realtimeStatuses]);

  // Accordion expand/collapse state
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(() => {
    if (currentBatchId) return new Set([currentBatchId]);
    return new Set();
  });

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  }

  // Date filter state for custom range inputs
  const [showCustomDates, setShowCustomDates] = useState(
    !!(currentDateFrom || currentDateTo) && !currentDatePreset
  );
  const [customFrom, setCustomFrom] = useState(currentDateFrom ?? "");
  const [customTo, setCustomTo] = useState(currentDateTo ?? "");

  const activeDateField = currentDateField ?? "uploaded_at";

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  async function handleDelete(invoiceId: string) {
    setIsDeleting(true);
    setDeleteWarning(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/delete`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setDeleteWarning(json.error || "Failed to delete invoice.");
        setIsDeleting(false);
        return;
      }
      if (json.data?.warning) {
        setDeleteWarning(json.data.warning);
        // Still deleted successfully, just show warning briefly
        setTimeout(() => {
          setDeleteTarget(null);
          setDeleteWarning(null);
          router.refresh();
        }, 4000);
      } else {
        setDeleteTarget(null);
        router.refresh();
      }
    } catch {
      setDeleteWarning("An unexpected error occurred.");
    } finally {
      setIsDeleting(false);
    }
  }

  const activeFilterCount = (currentOutputType !== "all" ? 1 : 0)
    + (currentDatePreset || currentDateFrom || currentDateTo ? 1 : 0);

  const currentSortLabel = SORT_LABELS.find(
    (opt) => opt.sort === currentSort && opt.direction === currentDirection
  )?.label ?? "Newest";

  async function handleRetry(invoiceId: string) {
    setRetryingId(invoiceId);
    try {
      await fetch(`/api/invoices/${invoiceId}/retry`, { method: "POST" });
      router.refresh();
    } catch {
      // Silently fail -- user can retry again
    } finally {
      setRetryingId(null);
    }
  }

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

  /** Row background by status */
  function rowBg(status: string): string {
    if (status === "pending_review") return "bg-[#FFFBF5]";
    if (status === "error") return "bg-[#FEF8F8]";
    return "bg-surface";
  }

  /** Render a single invoice as a desktop table row */
  function renderDesktopInvoiceRow(invoice: InvoiceListItem, indented?: boolean) {
    const isProcessing = invoice.status === "extracting" || invoice.status === "uploaded";
    const isError = invoice.status === "error";
    const vendorName = invoice.extracted_data?.vendor_name;
    const invoiceNum = invoice.extracted_data?.invoice_number;

    return (
      <tr
        key={invoice.id}
        className={`border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group cursor-pointer ${
          indented ? "bg-white" : rowBg(invoice.status)
        }`}
        onClick={() => router.push(`/invoices/${invoice.id}/review`)}
      >
        {/* Invoice (vendor + file) */}
        <td className="py-3.5 px-4 max-w-[280px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-text truncate">
              {isProcessing ? (
                <span className="text-muted italic">Processing...</span>
              ) : isError ? (
                vendorName || invoice.file_name
              ) : (
                vendorName ?? <span className="text-muted">Unknown vendor</span>
              )}
            </span>
            {invoice.source === "email" && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full shrink-0"
                title={invoice.email_sender ? `From: ${invoice.email_sender}` : "Received via email"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M2.5 3A1.5 1.5 0 001 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0015 5.293V4.5A1.5 1.5 0 0013.5 3h-11z" />
                  <path d="M15 6.954L8.978 9.86a2.25 2.25 0 01-1.956 0L1 6.954V11.5A1.5 1.5 0 002.5 13h11a1.5 1.5 0 001.5-1.5V6.954z" />
                </svg>
                Email
              </span>
            )}
            {invoice.source === "sms" && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-green-50 text-green-600 rounded-full shrink-0"
                title={invoice.sms_body_context ? `Note: ${invoice.sms_body_context}` : "Received via SMS"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
                </svg>
                SMS
              </span>
            )}
          </div>
          {isError && invoice.error_message ? (
            <div className="text-[12px] text-[#DC2626] truncate mt-0.5">{invoice.error_message}</div>
          ) : (
            <div className="text-[12px] text-muted truncate mt-0.5">
              {invoiceNum && <><span className="font-mono">#{invoiceNum}</span> &middot; </>}
              {invoice.file_name}
            </div>
          )}
        </td>
        {/* Date */}
        <td className="py-3.5 px-4 text-[13px] text-text">
          {formatDate(invoice.extracted_data?.invoice_date ?? null)}
        </td>
        {/* Amount */}
        <td className="py-3.5 px-4 text-[14px] text-right font-mono font-semibold tabular-nums">
          {invoice.extracted_data?.total_amount != null
            ? formatCurrency(invoice.extracted_data.total_amount, null)
            : "\u2014"}
        </td>
        {/* Status */}
        <td className="py-3.5 px-4 text-center">
          <span className="inline-flex items-center gap-1.5">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === "synced" && invoice.output_type && (
              <span className="text-[11px] text-muted">
                {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
              </span>
            )}
          </span>
        </td>
        {/* Action */}
        <td className="py-3.5 px-4 text-right">
          <div className="flex items-center justify-end gap-2">
            {invoice.status === "pending_review" && (
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/invoices/${invoice.id}/review`); }}
                className="inline-flex items-center px-3 py-1.5 text-[13px] font-medium bg-[#0F172A] text-white rounded-lg hover:bg-[#1E293B] transition-colors"
              >
                Review &rarr;
              </button>
            )}
            {invoice.status === "approved" && (
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/invoices/${invoice.id}/review`); }}
                className="inline-flex items-center px-3 py-1.5 text-[13px] font-medium border border-border text-text rounded-lg hover:bg-background transition-colors"
              >
                Sync &rarr;
              </button>
            )}
            {invoice.status === "error" && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRetry(invoice.id); }}
                disabled={retryingId === invoice.id}
                className="inline-flex items-center px-3 py-1.5 text-[13px] font-medium border border-[#FECACA] text-[#DC2626] rounded-lg hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
              >
                {retryingId === invoice.id ? "Retrying..." : "Retry"}
              </button>
            )}
            {(invoice.status === "synced" || isProcessing) && (
              <span className="text-[12px] text-muted">{formatRelativeTime(invoice.uploaded_at)}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget({ id: invoice.id, fileName: invoice.file_name });
              }}
              className="p-1.5 rounded-md text-muted hover:text-error hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150"
              title="Delete invoice"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  }

  /** Render a single invoice as a mobile card */
  function renderMobileInvoiceCard(invoice: InvoiceListItem) {
    const isProcessing = invoice.status === "extracting" || invoice.status === "uploaded";
    const isError = invoice.status === "error";
    const vendorName = invoice.extracted_data?.vendor_name;
    const invoiceNum = invoice.extracted_data?.invoice_number;

    const mobileBg = invoice.status === "pending_review"
      ? "bg-[#FFFBF5] border-[#FED7AA]/50"
      : isError
        ? "bg-[#FEF8F8] border-[#FECACA]/50"
        : "bg-surface border-border";

    return (
      <Link
        key={invoice.id}
        href={`/invoices/${invoice.id}/review`}
        className={`block rounded-lg p-4 border hover:border-primary/30 transition-all duration-150 ${mobileBg}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-text truncate max-w-[200px]">
            {isProcessing ? (
              <span className="text-muted italic">Processing...</span>
            ) : isError ? (
              vendorName || invoice.file_name
            ) : (
              vendorName ?? <span className="text-muted">Unknown vendor</span>
            )}
          </span>
          <span className="inline-flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === "synced" && invoice.output_type && (
              <span className="text-xs text-muted">
                {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
              </span>
            )}
          </span>
        </div>
        <div className="text-[12px] text-muted mb-1.5">
          {isError && invoice.error_message ? (
            <span className="text-[#DC2626]">{invoice.error_message}</span>
          ) : (
            <>
              {invoiceNum && <><span className="font-mono">#{invoiceNum}</span> &middot; </>}
              {invoice.file_name}
            </>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono font-semibold tabular-nums">
            {invoice.extracted_data?.total_amount != null
              ? formatCurrency(invoice.extracted_data.total_amount, null)
              : "\u2014"}
          </span>
          <span className="text-muted text-xs">
            {formatRelativeTime(invoice.uploaded_at)}
          </span>
        </div>
      </Link>
    );
  }

  /** Render batch empty state banner */
  function renderBatchEmptyState(batchInvoices: InvoiceListItem[]) {
    const emptyState = getBatchEmptyState(batchInvoices);
    if (!emptyState) return null;

    return (
      <div
        className="px-4 py-3 text-sm font-medium flex items-center gap-2"
        style={{ color: emptyState.color }}
      >
        {emptyState.icon === "check" && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {emptyState.message}
      </div>
    );
  }

  /** Render desktop rows for a single InvoiceRow (batch or individual) */
  function renderDesktopRow(row: InvoiceRow) {
    if (row.type === "individual") {
      return renderDesktopInvoiceRow(row.invoices[0]);
    }

    // Batch row
    const isExpanded = expandedBatches.has(row.batchId);
    return (
      <tr key={`batch-${row.batchId}`}>
        <td colSpan={5} className="p-0">
          <BatchHeader
            batchId={row.batchId}
            invoices={row.invoices}
            isExpanded={isExpanded}
            onToggle={() => toggleBatch(row.batchId)}
            isAccountingConnected={isAccountingConnected}
          />
          {isExpanded && (
            <div className="border-l-2 border-blue-200 ml-3">
              <table className="w-full">
                <tbody>
                  {row.invoices.map((inv) => renderDesktopInvoiceRow(inv, true))}
                </tbody>
              </table>
              {renderBatchEmptyState(row.invoices)}
            </div>
          )}
        </td>
      </tr>
    );
  }

  /** Render mobile cards for a single InvoiceRow (batch or individual) */
  function renderMobileRow(row: InvoiceRow) {
    if (row.type === "individual") {
      return renderMobileInvoiceCard(row.invoices[0]);
    }

    // Batch row
    const isExpanded = expandedBatches.has(row.batchId);
    return (
      <div key={`batch-${row.batchId}`}>
        <BatchHeader
          batchId={row.batchId}
          invoices={row.invoices}
          isExpanded={isExpanded}
          onToggle={() => toggleBatch(row.batchId)}
          isAccountingConnected={isAccountingConnected}
        />
        {isExpanded && (
          <div className="border-l-2 border-blue-200 ml-3 space-y-2 pb-2">
            {row.invoices.map((inv) => renderMobileInvoiceCard(inv))}
            {renderBatchEmptyState(row.invoices)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toast Message */}
      {toastMessage && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[#D1FAE5] text-[#065F46] text-sm font-medium flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {toastMessage}
        </div>
      )}

      {/* Stat Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STAT_PILLS.filter((pill) => counts[pill.status] > 0).map((pill) => {
          const count = counts[pill.status];
          const isActive = currentStatus === pill.status;
          return (
            <Link
              key={pill.status}
              href={buildUrl(pathname, searchParams, {
                status: isActive ? undefined : pill.status,
                cursor: undefined,
              })}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] font-semibold border transition-all duration-150 ${
                isActive
                  ? `${pill.bg} ${pill.border} ${pill.text} ring-2 ring-offset-1 ring-current/20`
                  : `${pill.bg} ${pill.border} ${pill.text} hover:shadow-sm`
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
              {pill.label(count)}
            </Link>
          );
        })}
        {currentStatus !== "all" && (
          <Link
            href={buildUrl(pathname, searchParams, { status: undefined, cursor: undefined })}
            className="text-[13px] text-muted hover:text-text transition-colors ml-1"
          >
            Clear filter
          </Link>
        )}
      </div>

      {/* Toolbar: Search + Filters + Sort */}
      <div className="flex items-center gap-2 mb-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendors, invoice numbers..."
            className="w-full pl-9 pr-8 py-2 rounded-[10px] bg-surface border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters Button */}
        <div className="relative" ref={filtersRef}>
          <button
            onClick={() => { setShowFilters(!showFilters); setShowSort(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface border text-sm font-medium transition-all ${
              activeFilterCount > 0
                ? "border-primary text-primary"
                : "border-border text-text hover:border-primary/30"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-white text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Filters Popover */}
          {showFilters && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowFilters(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-xl shadow-float z-30 p-4">
                {/* Type section */}
                <div className="mb-4">
                  <div className="text-[12px] font-semibold text-muted mb-2">Type</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPE_FILTER_CHIPS.map((chip) => {
                      const isActive = currentOutputType === chip.key;
                      return (
                        <button
                          key={chip.key}
                          onClick={() => {
                            router.push(buildUrl(pathname, searchParams, {
                              output_type: chip.key === "all" ? undefined : chip.key,
                              cursor: undefined,
                            }));
                          }}
                          className={`px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-all ${
                            isActive
                              ? "bg-[#0F172A] text-white"
                              : "bg-background text-text hover:bg-border"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date Range section */}
                <div className="mb-3">
                  <div className="text-[12px] font-semibold text-muted mb-2">Date Range</div>
                  {/* Date field toggle */}
                  <div className="flex rounded-[10px] border border-border overflow-hidden mb-2">
                    {DATE_FIELD_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          router.push(buildUrl(pathname, searchParams, {
                            date_field: opt.key === "uploaded_at" ? undefined : opt.key,
                            cursor: undefined,
                          }));
                        }}
                        className={`flex-1 px-3 py-1.5 text-[13px] font-medium transition-all ${
                          activeDateField === opt.key
                            ? "bg-[#0F172A] text-white"
                            : "bg-surface text-text hover:bg-background"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Date preset buttons */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {DATE_PRESET_OPTIONS.map((opt) => {
                      const isCustom = opt.key === "custom";
                      const isActive = isCustom
                        ? showCustomDates && !currentDatePreset
                        : currentDatePreset === opt.key;

                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            if (isCustom) {
                              setShowCustomDates(true);
                              if (currentDatePreset) {
                                router.push(buildUrl(pathname, searchParams, {
                                  date_preset: undefined,
                                  date_from: undefined,
                                  date_to: undefined,
                                  cursor: undefined,
                                }));
                              }
                            } else {
                              setShowCustomDates(false);
                              router.push(buildUrl(pathname, searchParams, {
                                date_preset: opt.key,
                                date_from: undefined,
                                date_to: undefined,
                                cursor: undefined,
                              }));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-all ${
                            isActive
                              ? "bg-[#0F172A] text-white"
                              : "bg-background text-text hover:bg-border"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom date range inputs */}
                  {showCustomDates && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="flex-1 border border-border rounded-[10px] px-2 py-1.5 text-[13px] text-text"
                      />
                      <span className="text-[12px] text-muted">to</span>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="flex-1 border border-border rounded-[10px] px-2 py-1.5 text-[13px] text-text"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customFrom || customTo) {
                            router.push(buildUrl(pathname, searchParams, {
                              date_preset: undefined,
                              date_from: customFrom || undefined,
                              date_to: customTo || undefined,
                              cursor: undefined,
                            }));
                          }
                        }}
                        className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium bg-[#0F172A] text-white hover:bg-[#1E293B] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomDates(false);
                      setCustomFrom("");
                      setCustomTo("");
                      router.push(buildUrl(pathname, searchParams, {
                        output_type: undefined,
                        date_field: undefined,
                        date_preset: undefined,
                        date_from: undefined,
                        date_to: undefined,
                        cursor: undefined,
                      }));
                    }}
                    className="text-[13px] text-muted hover:text-error transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sort Button */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => { setShowSort(!showSort); setShowFilters(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface border border-border text-sm font-medium text-text hover:border-primary/30 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 16.5m0 0L12 12m4.5 4.5V3" />
            </svg>
            {currentSortLabel}
          </button>

          {/* Sort Dropdown */}
          {showSort && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowSort(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-xl shadow-float z-30 py-1">
                {SORT_LABELS.map((opt) => {
                  const isActive = opt.sort === currentSort && opt.direction === currentDirection;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        router.push(buildUrl(pathname, searchParams, {
                          sort: opt.sort,
                          direction: opt.direction,
                          cursor: undefined,
                        }));
                        setShowSort(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-[13px] font-medium transition-colors flex items-center justify-between ${
                        isActive ? "text-primary bg-primary/5" : "text-text hover:bg-background"
                      }`}
                    >
                      {opt.label}
                      {isActive && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter empty state */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted text-sm">
            {searchQuery ? "No invoices match your search." : "No invoices match this filter."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table (card-wrapped) */}
          <div className="hidden md:block">
            <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#F1F5F9]">
                    <th className="text-left text-[12px] font-semibold text-muted py-2.5 px-4">Invoice</th>
                    <th className="text-left text-[12px] font-semibold text-muted py-2.5 px-4">Date</th>
                    <th className="text-right text-[12px] font-semibold text-muted py-2.5 px-4">Amount</th>
                    <th className="text-center text-[12px] font-semibold text-muted py-2.5 px-4">Status</th>
                    <th className="text-right text-[12px] font-semibold text-muted py-2.5 px-4 w-[160px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => renderDesktopRow(row))}
                </tbody>
              </table>

              {/* Pagination (inside card footer) */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#F1F5F9] bg-[#FAFBFC]">
                <div className="text-[13px] text-muted">
                  Showing {filteredInvoices.length} of {counts[currentStatus as keyof InvoiceListCounts] ?? counts.all} invoices
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
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => renderMobileRow(row))}

            {/* Mobile Pagination */}
            <div className="flex items-center justify-between pt-3">
              <div className="text-[13px] text-muted">
                Showing {filteredInvoices.length} of {counts[currentStatus as keyof InvoiceListCounts] ?? counts.all}
              </div>
              <div className="flex gap-2">
                {hasCursor && (
                  <Link href={buildUrl(pathname, searchParams, { cursor: undefined })}>
                    <Button variant="outline">Previous</Button>
                  </Link>
                )}
                {nextCursor && (
                  <Link href={buildUrl(pathname, searchParams, { cursor: nextCursor })}>
                    <Button variant="outline">Next</Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !isDeleting && setDeleteTarget(null)} />
          <div className="relative bg-surface rounded-brand-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-headings font-bold text-lg text-text mb-2">Delete Invoice</h3>
            <p className="text-sm text-muted mb-6">
              Are you sure you want to delete <span className="font-semibold text-text">{deleteTarget.fileName}</span>? This action will archive the invoice and remove it from your list.
            </p>
            {deleteWarning && (
              <div className="mb-4 p-3 rounded-brand-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
                {deleteWarning}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setDeleteTarget(null); setDeleteWarning(null); }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(deleteTarget.id)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
