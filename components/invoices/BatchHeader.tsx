"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBatchStatusSummary, getNextReviewableInvoice } from "@/lib/invoices/batch-utils";
import type { InvoiceListItem } from "@/lib/invoices/types";
import { formatRelativeTime } from "@/lib/utils/date";

interface BatchHeaderProps {
  batchId: string;
  invoices: InvoiceListItem[];
  totalCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
}

interface RetryResult {
  retried: number;
  failed: number;
}

export default function BatchHeader({
  batchId,
  invoices,
  totalCount,
  isExpanded,
  onToggle,
}: BatchHeaderProps) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<RetryResult | null>(null);

  const summary = getBatchStatusSummary(invoices);
  const nextReviewableId = getNextReviewableInvoice(invoices);
  const earliestUploadedAt = invoices.reduce((earliest, inv) => {
    return inv.uploaded_at < earliest ? inv.uploaded_at : earliest;
  }, invoices[0]?.uploaded_at ?? "");

  const failedInvoices = invoices.filter((inv) => inv.status === "error");
  const hasProcessing = summary.processing > 0;

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

  return (
    <div className="mb-1">
      {/* Retry result banner */}
      {retryResult !== null && (
        <div
          className="mb-2 rounded-md px-4 py-2 text-sm font-medium"
          style={{ color: "#92400E", backgroundColor: "#FEF3C7" }}
        >
          Retried {retryResult.retried} invoice{retryResult.retried !== 1 ? "s" : ""}.
          {retryResult.failed > 0 && (
            <> {retryResult.failed} could not be retried.</>
          )}
        </div>
      )}

      {/* Main header row */}
      <div
        role="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="flex cursor-pointer flex-col gap-3 rounded-lg px-4 py-3 transition-colors md:flex-row md:items-center"
        style={{ backgroundColor: "#F8FAFC" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F1F5F9";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F8FAFC";
        }}
      >
        {/* Left: chevron + label */}
        <div className="flex items-center gap-2">
          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-4 w-4 flex-shrink-0 text-gray-500 transition-transform duration-200"
            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>

          {/* Batch label */}
          <span className="text-sm font-medium text-gray-800">
            Batch uploaded {formatRelativeTime(earliestUploadedAt)} &mdash;{" "}
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            {showViewAll && (
              <>
                {" "}
                <span className="text-gray-500">(showing {invoices.length} of {totalCount} &mdash; </span>
                <button
                  type="button"
                  onClick={handleViewAll}
                  className="text-blue-600 underline hover:text-blue-700"
                >
                  View all
                </button>
                <span className="text-gray-500">)</span>
              </>
            )}
          </span>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2 md:ml-auto">
          {summary.processing > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ color: "#1E40AF", backgroundColor: "#DBEAFE" }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-pulse rounded-full opacity-75"
                  style={{ backgroundColor: "#1E40AF" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "#1E40AF" }}
                />
              </span>
              {summary.processing} processing
            </span>
          )}

          {summary.readyForReview > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ color: "#92400E", backgroundColor: "#FEF3C7" }}
            >
              {summary.readyForReview} ready
            </span>
          )}

          {summary.approved > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ color: "#1D4ED8", backgroundColor: "#DBEAFE" }}
            >
              {summary.approved} approved
            </span>
          )}

          {summary.synced > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ color: "#065F46", backgroundColor: "#D1FAE5" }}
            >
              {summary.synced} synced
            </span>
          )}

          {summary.failed > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ color: "#991B1B", backgroundColor: "#FEE2E2" }}
            >
              {summary.failed} failed
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div
          className="flex w-full flex-col gap-2 sm:flex-row md:w-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Retry All Failed */}
          {summary.failed > 0 && (
            <button
              type="button"
              onClick={handleRetryAll}
              disabled={isRetrying}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-600 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              {isRetrying ? (
                <>
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
                  Retrying&hellip;
                </>
              ) : (
                <>Retry {summary.failed} Failed</>
              )}
            </button>
          )}

          {/* Review Next */}
          <button
            type="button"
            onClick={handleReviewNext}
            disabled={reviewNextDisabled}
            title={reviewNextTitle}
            className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            Review Next
          </button>
        </div>
      </div>
    </div>
  );
}
