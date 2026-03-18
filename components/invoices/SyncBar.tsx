"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type SyncBarState = "idle" | "confirming" | "syncing" | "synced" | "failed";

interface SyncBarProps {
  invoiceId: string;
  invoiceStatus: string;
  /** Whether there was a previous failed sync attempt (shows retry UI) */
  isRetry?: boolean;
  /** Called after successful sync to refresh parent state */
  onSyncComplete?: () => void;
  /** List of reasons sync cannot proceed (e.g., missing vendor, missing GL accounts) */
  syncBlockers?: string[];
}

export default function SyncBar({
  invoiceId,
  invoiceStatus,
  isRetry = false,
  onSyncComplete,
  syncBlockers = [],
}: SyncBarProps) {
  const [barState, setBarState] = useState<SyncBarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  // Only allow sync for approved invoices with no blockers
  const canSync = invoiceStatus === "approved" && syncBlockers.length === 0;

  const handleSync = useCallback(async () => {
    if (!canSync) return;

    if (barState === "idle" || barState === "failed") {
      // First click → enter confirming state
      setBarState("confirming");
      setErrorMessage(null);
      setWarning(null);
      confirmTimer.current = setTimeout(() => {
        setBarState("idle");
      }, 3000);
      return;
    }

    if (barState === "confirming") {
      // Second click → fire sync
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setBarState("syncing");
      setErrorMessage(null);

      try {
        const endpoint = isRetry
          ? `/api/invoices/${invoiceId}/sync/retry`
          : `/api/invoices/${invoiceId}/sync`;

        const res = await fetch(endpoint, { method: "POST" });
        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error ?? "Failed to sync invoice");
        }

        setBarState("synced");

        // Show attachment warning if applicable
        if (body.data?.warning) {
          setWarning(body.data.warning);
        }

        // Notify parent to refresh
        onSyncComplete?.();
      } catch (err) {
        setBarState("failed");
        const message = err instanceof Error ? err.message : "Failed to sync invoice";
        setErrorMessage(message);
        // Auto-dismiss error after 10 seconds
        errorTimer.current = setTimeout(() => {
          setErrorMessage(null);
        }, 10000);
      }
    }
  }, [barState, canSync, invoiceId, isRetry, onSyncComplete]);

  // Don't render for non-approved invoices
  if (invoiceStatus === "synced") {
    return (
      <div className="bg-white px-6 py-4 flex items-center gap-3">
        <svg className="h-5 w-5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="text-sm text-accent">
          This invoice has been synced to QuickBooks.
        </span>
      </div>
    );
  }

  if (invoiceStatus !== "approved") return null;

  // Button config by state
  const buttonConfig: Record<SyncBarState, { label: string; className: string; disabled: boolean }> = {
    idle: {
      label: isRetry ? "Retry Sync to QuickBooks" : "Sync to QuickBooks",
      className: syncBlockers.length > 0
        ? "bg-border text-muted cursor-not-allowed"
        : "bg-primary text-white hover:bg-primary-hover",
      disabled: syncBlockers.length > 0,
    },
    confirming: {
      label: isRetry ? "Confirm Retry" : "Confirm Sync",
      className: "bg-accent text-white hover:bg-green-700",
      disabled: false,
    },
    syncing: {
      label: "Syncing...",
      className: "bg-primary/60 text-white cursor-not-allowed",
      disabled: true,
    },
    synced: {
      label: "Synced",
      className: "bg-accent text-white cursor-not-allowed",
      disabled: true,
    },
    failed: {
      label: "Retry Sync",
      className: syncBlockers.length > 0
        ? "bg-border text-muted cursor-not-allowed"
        : "bg-error text-white hover:bg-red-700",
      disabled: syncBlockers.length > 0,
    },
  };

  const btn = buttonConfig[barState];

  return (
    <div className="bg-white px-6 py-4 space-y-2">
      {syncBlockers.length > 0 && (
        <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-2.5">
          <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="text-xs text-warning">
            <p className="font-medium mb-1">Before syncing:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {syncBlockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        {/* Left side: status message */}
        <div className="text-sm flex items-center gap-2 min-w-0">
          {barState === "synced" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">
                Invoice synced to QuickBooks.
              </span>
            </>
          ) : errorMessage ? (
            <>
              <span className="h-2 w-2 rounded-full bg-error shrink-0" />
              <span className="text-error truncate">{errorMessage}</span>
            </>
          ) : barState === "confirming" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse" />
              <span className="text-warning">
                Click again to confirm
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="text-muted">
                {isRetry
                  ? "Previous sync failed. Ready to retry."
                  : "Ready to sync to QuickBooks."}
              </span>
            </>
          )}
        </div>

        {/* Right side: sync button */}
        <button
          type="button"
          onClick={handleSync}
          disabled={btn.disabled}
          className={`${btn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
        >
          {barState === "syncing" && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {barState === "synced" && (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {btn.label}
        </button>
      </div>

      {/* Attachment warning */}
      {warning && (
        <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-2.5">
          <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-warning">{warning}</p>
        </div>
      )}
    </div>
  );
}
