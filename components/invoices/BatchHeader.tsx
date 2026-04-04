"use client";

import { useState, useEffect, useMemo, useCallback, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getBatchStatusSummary, getNextReviewableInvoice } from "@/lib/invoices/batch-utils";
import type { InvoiceListItem } from "@/lib/invoices/types";
import { formatRelativeTime } from "@/lib/utils/date";
import { useInvoiceStatuses } from "@/lib/hooks/useInvoiceStatuses";
import PrepareApproveDialog, { type PreparePreview } from "./PrepareApproveDialog";
import BatchSyncDialog, { type SyncInvoiceItem } from "./BatchSyncDialog";
import type { OutputType } from "@/lib/types/invoice";

interface BatchHeaderProps {
  batchId: string;
  invoices: InvoiceListItem[];
  totalCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
  isAccountingConnected?: boolean;
  children?: ReactNode;
}

interface RetryResult {
  retried: number;
  failed: number;
}

/** Spinner SVG shared between buttons */
function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** Tiny colored dot + count for collapsed status indicators */
function StatusDot({ color, count }: { color: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px]" style={{ color }}>{count}</span>
    </span>
  );
}

export default function BatchHeader({
  batchId,
  invoices,
  totalCount,
  isExpanded,
  onToggle,
  isAccountingConnected,
  children,
}: BatchHeaderProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // --- Retry state ---
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<RetryResult | null>(null);

  // --- Prepare & Approve state ---
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [preparePreview, setPreparePreview] = useState<PreparePreview | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [approveResult, setApproveResult] = useState<{
    approved: number;
    skipped: number;
    vendorsMatched: number;
    vendorsCreated: number;
    glSuggestionsAccepted: number;
    skippedInvoices: Array<{ id: string; fileName: string; reason: string }>;
  } | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);

  // --- Sync All state ---
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingInvoiceIds, setSyncingInvoiceIds] = useState<string[]>([]);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  const summary = getBatchStatusSummary(invoices);
  const nextReviewableId = getNextReviewableInvoice(invoices);
  const earliestUploadedAt = invoices.reduce((earliest, inv) => {
    return inv.uploaded_at < earliest ? inv.uploaded_at : earliest;
  }, invoices[0]?.uploaded_at ?? "");

  const failedInvoices = invoices.filter((inv) => inv.status === "error");
  const hasProcessing = summary.processing > 0;
  const allSynced = invoices.length > 0 && invoices.every((inv) => inv.status === "synced");

  // --- Retry handler ---
  const handleRetryAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRetrying || failedInvoices.length === 0) return;

    setIsRetrying(true);
    setRetryResult(null);

    let retried = 0;
    let failed = 0;

    for (const invoice of failedInvoices) {
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/retry`, {
          method: "POST",
        });
        if (res.ok) {
          retried++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setIsRetrying(false);

    if (failed > 0) {
      setRetryResult({ retried, failed });
      setTimeout(() => setRetryResult(null), 5000);
    }

    router.refresh();
  };

  // --- Prepare & Approve handlers ---
  const handlePrepareApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoadingPreview || isExecuting) return;

    setIsLoadingPreview(true);
    setApproveResult(null);

    try {
      const res = await fetch("/api/invoices/batch/prepare-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const body = await res.json();
      if (res.ok) {
        setPreparePreview(body.data);
      }
    } catch {
      // Network error - user can retry
    }

    setIsLoadingPreview(false);
  };

  const handleConfirmPrepareApprove = useCallback(async (createVendorForInvoiceIds: string[]) => {
    if (isExecuting) return;

    setIsExecuting(true);

    try {
      const res = await fetch("/api/invoices/batch/prepare-and-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: batchId,
          create_vendor_for_invoice_ids: createVendorForInvoiceIds,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setApproveResult(body.data);
        setShowSkippedDetails(false);
        setTimeout(() => setApproveResult(null), 8000);
      }
    } catch {
      // Network error - user can retry
    }

    setIsExecuting(false);
    setPreparePreview(null);
    // Use transition so the refresh doesn't interrupt the banner render
    startTransition(() => router.refresh());
  }, [batchId, isExecuting, router, startTransition]);

  const handleCancelPrepareApprove = useCallback(() => {
    if (!isExecuting) {
      setPreparePreview(null);
    }
  }, [isExecuting]);

  // --- Sync All handler ---
  const handleSyncAllClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncing) return;
    setShowSyncDialog(true);
  };

  const handleSyncConfirm = useCallback(
    async (
      invoiceConfigs: Array<{
        id: string;
        outputType: OutputType;
        paymentAccountId: string | null;
        paymentAccountName: string | null;
      }>
    ) => {
      if (isSyncing) return;

      setIsSyncing(true);
      setSyncComplete(false);
      setSyncResult(null);

      // Update each invoice's output type + payment account before syncing
      const updatePromises = invoiceConfigs.map((cfg) =>
        fetch(`/api/invoices/${cfg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            output_type: cfg.outputType,
            payment_account_id: cfg.paymentAccountId,
            payment_account_name: cfg.paymentAccountName,
          }),
        })
      );

      try {
        await Promise.all(updatePromises);
      } catch {
        // Best effort -- sync will catch validation errors
      }

      setShowSyncDialog(false);

      // Fire batch sync
      try {
        const res = await fetch("/api/invoices/batch/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: batchId }),
        });
        const body = await res.json();
        if (res.ok && body.data.invoiceIds.length > 0) {
          setSyncingInvoiceIds(body.data.invoiceIds);
        } else {
          setIsSyncing(false);
        }
      } catch {
        setIsSyncing(false);
      }
    },
    [batchId, isSyncing]
  );

  const handleSyncCancel = useCallback(() => {
    if (!isSyncing) setShowSyncDialog(false);
  }, [isSyncing]);

  // --- Realtime sync progress tracking ---
  const { statuses: realtimeStatuses } = useInvoiceStatuses(syncingInvoiceIds);

  const syncProgress = useMemo(() => {
    if (syncingInvoiceIds.length === 0) return null;
    let synced = 0;
    let failed = 0;
    for (const id of syncingInvoiceIds) {
      const s = realtimeStatuses[id];
      if (s?.status === "synced") synced++;
      else if (s?.status === "error") failed++;
    }
    return {
      synced,
      failed,
      total: syncingInvoiceIds.length,
      done: synced + failed === syncingInvoiceIds.length,
    };
  }, [syncingInvoiceIds, realtimeStatuses]);

  useEffect(() => {
    if (syncProgress?.done && !syncComplete) {
      setSyncComplete(true);
      setIsSyncing(false);
      setSyncResult({ synced: syncProgress.synced, failed: syncProgress.failed });
      setSyncingInvoiceIds([]);
      setTimeout(() => setSyncResult(null), 8000);
      router.refresh();
    }
  }, [syncProgress, syncComplete, router]);

  // --- Misc ---
  const handleReviewNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nextReviewableId) return;
    router.push(`/invoices/${nextReviewableId}/review`);
  };

  const handleViewAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`?batch_id=${batchId}`);
  };

  const reviewNextDisabled = !nextReviewableId;
  const reviewNextTitle = hasProcessing
    ? "Waiting for extraction"
    : nextReviewableId === null
      ? "All reviewed"
      : undefined;

  const showViewAll = totalCount !== undefined && totalCount > invoices.length;

  // Sync button label
  let syncButtonLabel: React.ReactNode;
  if (isSyncing && syncProgress) {
    syncButtonLabel = `${syncProgress.synced} of ${syncProgress.total} synced\u2026`;
  } else if (isSyncing) {
    syncButtonLabel = (
      <>
        <Spinner />
        Syncing&hellip;
      </>
    );
  } else {
    syncButtonLabel = `Sync ${summary.approved} to accounting`;
  }

  // --- Footer text summary ---
  const footerSummaryParts: string[] = [];
  if (summary.processing > 0) footerSummaryParts.push(`${summary.processing} processing`);
  if (summary.readyForReview > 0) footerSummaryParts.push(`${summary.readyForReview} need review`);
  if (summary.approved > 0) footerSummaryParts.push(`${summary.approved} approved`);
  if (summary.synced > 0) footerSummaryParts.push(`${summary.synced} synced`);
  if (summary.failed > 0) footerSummaryParts.push(`${summary.failed} failed`);
  const footerSummaryText = footerSummaryParts.join(" \u00b7 ");

  // Does the footer have any action buttons to show?
  const hasFooterActions =
    summary.failed > 0 ||
    summary.readyForReview > 0 ||
    (summary.approved > 0 && isAccountingConnected) ||
    nextReviewableId !== null;

  return (
    <div>
      {/* Batch completion banner */}
      {allSynced && (
        <div
          className="mb-1 flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium"
          style={{ color: "#065F46", backgroundColor: "#D1FAE5" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
          Batch complete - {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} synced
        </div>
      )}

      {/* Retry result banner */}
      {retryResult !== null && (
        <div
          className="mb-1 rounded-md px-4 py-2 text-sm font-medium"
          style={{ color: "#92400E", backgroundColor: "#FEF3C7" }}
        >
          Retried {retryResult.retried} invoice{retryResult.retried !== 1 ? "s" : ""}.
          {retryResult.failed > 0 && (
            <> {retryResult.failed} could not be retried.</>
          )}
        </div>
      )}

      {/* Approve result banner */}
      {approveResult !== null && (
        <div
          className="mb-1 rounded-md px-4 py-2 text-sm font-medium"
          style={{ color: "#065F46", backgroundColor: "#D1FAE5" }}
        >
          {approveResult.approved} approved
          {(approveResult.vendorsMatched > 0 || approveResult.vendorsCreated > 0 || approveResult.glSuggestionsAccepted > 0) && (
            <span className="font-normal">
              {" "}(
              {[
                approveResult.vendorsMatched > 0 &&
                  `${approveResult.vendorsMatched} vendor${approveResult.vendorsMatched !== 1 ? "s" : ""} matched`,
                approveResult.vendorsCreated > 0 &&
                  `${approveResult.vendorsCreated} vendor${approveResult.vendorsCreated !== 1 ? "s" : ""} created`,
                approveResult.glSuggestionsAccepted > 0 &&
                  `${approveResult.glSuggestionsAccepted} GL suggestion${approveResult.glSuggestionsAccepted !== 1 ? "s" : ""} accepted`,
              ]
                .filter(Boolean)
                .join(", ")}
              )
            </span>
          )}
          {approveResult.skipped > 0 && (
            <>
              , {approveResult.skipped} skipped&nbsp;-&nbsp;
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => setShowSkippedDetails((v) => !v)}
              >
                {showSkippedDetails ? "Hide details" : "Show details"}
              </button>
            </>
          )}
          {showSkippedDetails && approveResult.skippedInvoices.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs font-normal">
              {approveResult.skippedInvoices.map((inv) => (
                <li key={inv.id}>
                  <span className="font-medium">{inv.fileName}</span>: {inv.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sync result banner */}
      {syncResult !== null && (
        <div
          className="mb-1 rounded-md px-4 py-2 text-sm font-medium"
          style={
            syncResult.failed > 0
              ? { color: "#92400E", backgroundColor: "#FEF3C7" }
              : { color: "#065F46", backgroundColor: "#D1FAE5" }
          }
        >
          {syncResult.synced} synced
          {syncResult.failed > 0 && <>, {syncResult.failed} failed</>}
        </div>
      )}

      {/* Slim header row */}
      <div
        role="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className={`flex cursor-pointer items-center py-2.5 px-5 transition-colors ${
          isExpanded ? "bg-[#FAFBFC]" : "bg-white hover:bg-[#FAFBFC]"
        }`}
      >
        {/* Left: chevron + text */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="flex-shrink-0 transition-transform duration-200"
            style={{
              width: "14px",
              height: "14px",
              color: "#94A3B8",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>

          <span className={`text-[13px] ${isExpanded ? "font-semibold text-gray-800" : "font-medium text-gray-500"}`}>
            Batch
          </span>
          <span className="text-[13px] text-gray-400">&middot;</span>
          <span className="text-[13px] text-gray-500">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[13px] text-gray-400">&middot;</span>
          <span className="text-[13px]" style={{ color: "#94A3B8" }}>
            {formatRelativeTime(earliestUploadedAt)}
          </span>
          {showViewAll && (
            <>
              <span className="text-[13px] text-gray-400">&middot;</span>
              <button
                type="button"
                onClick={handleViewAll}
                className="text-[13px] text-blue-600 underline hover:text-blue-700"
              >
                View all {totalCount}
              </button>
            </>
          )}
        </div>

        {/* Right: tiny status dot indicators */}
        <div className="ml-auto flex items-center gap-2">
          <StatusDot color="#2563EB" count={summary.processing} />
          <StatusDot color="#EA580C" count={summary.readyForReview} />
          <StatusDot color="#2563EB" count={summary.approved} />
          <StatusDot color="#059669" count={summary.synced} />
          <StatusDot color="#DC2626" count={summary.failed} />
        </div>
      </div>

      {/* Expanded children (invoice rows) */}
      {children}

      {/* Footer with actions (only when expanded and there are actions) */}
      {isExpanded && hasFooterActions && (
        <div
          className="flex items-center border-l-2 border-blue-200 ml-4 py-2.5 px-5"
          style={{ backgroundColor: "#FAFBFC", borderBottom: "1px solid #F1F5F9" }}
        >
          {/* Left: text summary */}
          <span className="text-xs text-gray-500">
            {footerSummaryText}
          </span>

          {/* Right: action buttons */}
          <div
            className="ml-auto flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Retry All Failed */}
            {summary.failed > 0 && (
              <button
                type="button"
                onClick={handleRetryAll}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-600 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRetrying ? (
                  <>
                    <Spinner />
                    Retrying&hellip;
                  </>
                ) : (
                  <>Retry {summary.failed} Failed</>
                )}
              </button>
            )}

            {/* Prepare & Approve N */}
            {summary.readyForReview > 0 && (
              <button
                type="button"
                onClick={handlePrepareApprove}
                disabled={isLoadingPreview || isExecuting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingPreview ? (
                  <>
                    <Spinner />
                    Checking&hellip;
                  </>
                ) : (
                  <>Prepare &amp; Approve {summary.readyForReview}</>
                )}
              </button>
            )}

            {/* Sync N to accounting */}
            {summary.approved > 0 && isAccountingConnected && (
              <button
                type="button"
                onClick={handleSyncAllClick}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-600 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncButtonLabel}
              </button>
            )}

            {/* Review Next */}
            <button
              type="button"
              onClick={handleReviewNext}
              disabled={reviewNextDisabled}
              title={reviewNextTitle}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Review Next
            </button>
          </div>
        </div>
      )}

      {/* Prepare & Approve confirmation dialog */}
      {preparePreview && (
        <PrepareApproveDialog
          preview={preparePreview}
          isExecuting={isExecuting}
          onConfirm={handleConfirmPrepareApprove}
          onCancel={handleCancelPrepareApprove}
        />
      )}

      {/* Batch sync dialog with output type selection */}
      {showSyncDialog && (
        <BatchSyncDialog
          invoices={invoices
            .filter((inv) => inv.status === "approved")
            .map((inv): SyncInvoiceItem => ({
              id: inv.id,
              fileName: inv.file_name,
              vendorName: inv.extracted_data?.vendor_name ?? null,
              totalAmount: inv.extracted_data?.total_amount ?? null,
              outputType: (inv.output_type ?? "bill") as OutputType,
              paymentAccountId: null,
              paymentAccountName: null,
            }))}
          isSyncing={isSyncing}
          onConfirm={handleSyncConfirm}
          onCancel={handleSyncCancel}
        />
      )}
    </div>
  );
}
