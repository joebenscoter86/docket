"use client";

import { useEffect, useRef } from "react";

export interface PreparePreview {
  fullyReady: number;
  vendorAutoMatchable: number;
  glSuggestionsToAccept: number;
  glInvoiceCount: number;
  needsManualReview: Array<{
    id: string;
    fileName: string;
    reasons: string[];
  }>;
  willApprove: number;
  willSkip: number;
}

interface PrepareApproveDialogProps {
  preview: PreparePreview;
  isExecuting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PrepareApproveDialog({
  preview,
  isExecuting,
  onConfirm,
  onCancel,
}: PrepareApproveDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExecuting) {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isExecuting]);

  // Focus trap: focus the dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const hasAutoActions =
    preview.vendorAutoMatchable > 0 || preview.glSuggestionsToAccept > 0;
  const syncReadyAfter =
    preview.fullyReady + preview.vendorAutoMatchable;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExecuting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prepare-approve-title"
        tabIndex={-1}
        className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl outline-none"
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-4">
          <h2
            id="prepare-approve-title"
            className="text-base font-semibold text-gray-900"
          >
            Prepare &amp; Approve {preview.willApprove} Invoice
            {preview.willApprove !== 1 ? "s" : ""}
          </h2>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* What will happen */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Here&apos;s what will happen:
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600">
              {preview.fullyReady > 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckIcon />
                  </span>
                  {preview.fullyReady} invoice
                  {preview.fullyReady !== 1 ? "s" : ""} ready to approve as-is
                </li>
              )}
              {preview.vendorAutoMatchable > 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <AutoIcon />
                  </span>
                  {preview.vendorAutoMatchable} vendor
                  {preview.vendorAutoMatchable !== 1 ? "s" : ""} will be
                  auto-matched
                </li>
              )}
              {preview.glSuggestionsToAccept > 0 && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <AutoIcon />
                  </span>
                  {preview.glSuggestionsToAccept} AI GL suggestion
                  {preview.glSuggestionsToAccept !== 1 ? "s" : ""} will be
                  accepted across {preview.glInvoiceCount} invoice
                  {preview.glInvoiceCount !== 1 ? "s" : ""}
                </li>
              )}
            </ul>
          </div>

          {/* Needs manual review */}
          {preview.needsManualReview.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-800">
                {preview.needsManualReview.length} invoice
                {preview.needsManualReview.length !== 1 ? "s" : ""} will be
                approved but need manual review before sync:
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                {preview.needsManualReview.map((inv) => (
                  <li key={inv.id}>
                    <span className="font-medium">{inv.fileName}</span>
                    {": "}
                    {inv.reasons.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skipped */}
          {preview.willSkip > 0 && (
            <p className="text-xs text-gray-500">
              {preview.willSkip} invoice
              {preview.willSkip !== 1 ? "s" : ""} will be skipped (missing
              required data).
            </p>
          )}

          {/* Summary line */}
          {hasAutoActions && (
            <p className="text-sm text-gray-600">
              After this, <span className="font-medium">{syncReadyAfter}</span>{" "}
              of {preview.willApprove} will be sync-ready.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isExecuting}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExecuting ? (
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
                Preparing...
              </>
            ) : (
              "Confirm & Approve"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-2.5 w-2.5"
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AutoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-2.5 w-2.5"
    >
      <path d="M8 1a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317l-2.791 2.39.853 3.593a.75.75 0 0 1-1.12.814L8 11.51l-3.136 1.752a.75.75 0 0 1-1.12-.814l.853-3.593-2.79-2.39a.75.75 0 0 1 .427-1.317l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1Z" />
    </svg>
  );
}
