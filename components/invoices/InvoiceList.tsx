"use client";

import { useState, useEffect, useMemo } from "react";
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
  // not UTC — prevents off-by-one day in US timezones.
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

  // Group into batch rows
  const rows = useMemo(() => groupInvoicesByBatch(mergedInvoices), [mergedInvoices]);

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
  const hasDateFilter = !!(currentDatePreset || currentDateFrom || currentDateTo);

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

  /** Render a single invoice as a desktop table row */
  function renderDesktopInvoiceRow(invoice: InvoiceListItem, indented?: boolean) {
    return (
      <tr
        key={invoice.id}
        className={`border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group cursor-pointer ${
          indented ? "bg-white" : ""
        }`}
        onClick={() => router.push(`/invoices/${invoice.id}/review`)}
      >
        <td className="py-3.5 px-3 text-[14px] text-text truncate max-w-[200px]">
          <span className="inline-flex items-center gap-1.5">
            {invoice.file_name}
            {invoice.source === "email" && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full"
                title={invoice.email_sender ? `From: ${invoice.email_sender}` : "Received via email"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M2.5 3A1.5 1.5 0 001 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0115 5.293V4.5A1.5 1.5 0 0013.5 3h-11z" />
                  <path d="M15 6.954L8.978 9.86a2.25 2.25 0 01-1.956 0L1 6.954V11.5A1.5 1.5 0 002.5 13h11a1.5 1.5 0 001.5-1.5V6.954z" />
                </svg>
                Email
              </span>
            )}
            {invoice.source === "sms" && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-green-50 text-green-600 rounded-full"
                title={invoice.sms_body_context ? `Note: ${invoice.sms_body_context}` : "Received via SMS"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
                </svg>
                SMS
              </span>
            )}
          </span>
        </td>
        <td className="py-3.5 px-3 text-[14px] font-medium text-text">
          {invoice.status === "error" && invoice.error_message ? (
            <span className="text-error text-[13px]">{invoice.error_message}</span>
          ) : (
            invoice.extracted_data?.vendor_name ?? (
              <span className="text-muted">Pending</span>
            )
          )}
        </td>
        <td className="py-3.5 px-3 font-mono text-[13px] text-text">
          {invoice.extracted_data?.invoice_number ?? "\u2014"}
        </td>
        <td className="py-3.5 px-3 font-mono text-[13px] text-text">
          {formatDate(invoice.extracted_data?.invoice_date ?? null)}
        </td>
        <td className="py-3.5 px-3 text-[14px] text-right font-mono font-medium">
          {invoice.extracted_data?.total_amount != null
            ? formatCurrency(invoice.extracted_data.total_amount, null)
            : "\u2014"}
        </td>
        <td className="py-3.5 px-3">
          <span className="inline-flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === "synced" && invoice.output_type && (
              <span className="text-xs text-muted">
                {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
              </span>
            )}
          </span>
        </td>
        <td className="py-3.5 px-3 text-[14px] text-muted">
          {formatRelativeTime(invoice.uploaded_at)}
        </td>
        <td className="py-3.5 px-3 text-right">
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
        </td>
      </tr>
    );
  }

  /** Render a single invoice as a mobile card */
  function renderMobileInvoiceCard(invoice: InvoiceListItem) {
    return (
      <Link
        key={invoice.id}
        href={`/invoices/${invoice.id}/review`}
        className="block bg-surface border border-border rounded-lg p-4 hover:border-primary/30 transition-all duration-150"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-text truncate max-w-[200px]">
            {invoice.file_name}
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
        <div className="text-sm text-text mb-1">
          {invoice.status === "error" && invoice.error_message ? (
            <span className="text-error text-[13px]">{invoice.error_message}</span>
          ) : (
            <>
              {invoice.extracted_data?.vendor_name ?? (
                <span className="text-muted">Pending</span>
              )}
              {invoice.extracted_data?.invoice_number && (
                <span className="text-text/70 ml-2 font-mono text-[13px]">
                  #{invoice.extracted_data.invoice_number}
                </span>
              )}
            </>
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
        <td colSpan={8} className="p-0">
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
        <div className="mb-4 px-4 py-3 rounded-md bg-[#D1FAE5] text-[#065F46] text-sm font-medium flex items-center gap-2">
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

      {/* Type Filter Chips */}
      <div className="flex gap-2 mb-6">
        {TYPE_FILTER_CHIPS.map((chip) => {
          const isActive = currentOutputType === chip.key;
          return (
            <Link
              key={chip.key}
              href={buildUrl(pathname, searchParams, {
                output_type: chip.key === "all" ? undefined : chip.key,
                cursor: undefined,
              })}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ease-in-out ${
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "bg-surface text-text border border-border hover:border-primary/30"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Date field toggle */}
        <div className="flex rounded-full border border-border overflow-hidden">
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
              className={`px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                activeDateField === opt.key
                  ? "bg-primary text-white"
                  : "bg-surface text-text hover:bg-background"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-border">|</span>

        {/* Date preset buttons */}
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
                  // Clear preset when switching to custom
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
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ease-in-out ${
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "bg-surface text-text border border-border hover:border-primary/30"
              }`}
            >
              {opt.label}
            </button>
          );
        })}

        {/* Clear date filter */}
        {hasDateFilter && (
          <button
            type="button"
            onClick={() => {
              setShowCustomDates(false);
              setCustomFrom("");
              setCustomTo("");
              router.push(buildUrl(pathname, searchParams, {
                date_field: undefined,
                date_preset: undefined,
                date_from: undefined,
                date_to: undefined,
                cursor: undefined,
              }));
            }}
            className="text-xs text-muted hover:text-error transition-colors"
          >
            Clear
          </button>
        )}

        {/* Custom date range inputs */}
        {showCustomDates && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-border rounded-md px-2 py-1 text-xs text-text"
              placeholder="From"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-border rounded-md px-2 py-1 text-xs text-text"
              placeholder="To"
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
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              Apply
            </button>
          </div>
        )}
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
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => renderDesktopRow(row))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => renderMobileRow(row))}
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
