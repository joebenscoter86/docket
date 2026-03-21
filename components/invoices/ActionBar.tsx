"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { InvoiceStatus, OutputType } from "@/lib/types/invoice";
import { getTransactionUrl, getProviderLabel } from "@/lib/accounting/links";
import type { AccountingProviderType } from "@/lib/accounting/types";

type ActionBarState =
  | "idle"
  | "approving"
  | "approved"
  | "confirming"
  | "syncing"
  | "synced"
  | "failed";

interface ActionBarProps {
  invoiceId: string;
  currentStatus: InvoiceStatus;
  vendorName: string | number | null;
  totalAmount: string | number | null;
  syncBlockers: string[];
  isRetry?: boolean;
  outputType: OutputType;
  provider: AccountingProviderType | null;
  onStatusChange: (newStatus: InvoiceStatus) => void;
}

export default function ActionBar({
  invoiceId,
  currentStatus,
  vendorName,
  totalAmount,
  syncBlockers,
  isRetry = false,
  outputType,
  provider,
  onStatusChange,
}: ActionBarProps) {
  const [barState, setBarState] = useState<ActionBarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [syncedEntityId, setSyncedEntityId] = useState<string | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    message: string;
    duplicates: { invoiceId: string; vendorName: string; invoiceNumber: string | null }[];
  } | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (approvedTimer.current) clearTimeout(approvedTimer.current);
    };
  }, []);

  // Reset internal state when parent status changes (e.g., after approve transitions to sync phase)
  // Preserve syncedEntityId so the synced read-only banner can show the "View in" link
  useEffect(() => {
    setBarState("idle");
    setErrorMessage(null);
    setWarning(null);
    setDuplicateConfirm(null);
  }, [currentStatus]);

  // --- Approve validation ---
  const missingFields: string[] = [];
  const vendorStr = String(vendorName ?? "").trim();
  if (!vendorStr) missingFields.push("vendor name");
  if (totalAmount === null || totalAmount === undefined || String(totalAmount).trim() === "") {
    missingFields.push("total amount");
  }
  const canApprove = missingFields.length === 0;

  // --- Sync validation ---
  const canSync = currentStatus === "approved" && syncBlockers.length === 0;

  // --- Approve handler (single click, no confirm gate) ---
  const handleApprove = useCallback(async () => {
    if (!canApprove) return;

    // Blur active element to trigger pending auto-saves
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    setBarState("approving");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to approve invoice");
      }

      setBarState("approved");
      // Brief success flash, then notify parent
      approvedTimer.current = setTimeout(() => {
        onStatusChange("approved");
      }, 500);
    } catch (err) {
      setBarState("idle");
      const message = err instanceof Error ? err.message : "Failed to approve invoice";
      setErrorMessage(message);
      errorTimer.current = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  }, [canApprove, invoiceId, onStatusChange]);

  // --- Sync handler (with confirm gate) ---
  const handleSync = useCallback(async () => {
    if (!canSync) return;

    if (barState === "idle" || barState === "failed") {
      setBarState("confirming");
      setErrorMessage(null);
      setWarning(null);
      // Revert to idle on timeout
      confirmTimer.current = setTimeout(() => {
        setBarState("idle");
      }, 3000);
      return;
    }

    if (barState === "confirming") {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setBarState("syncing");
      setErrorMessage(null);

      try {
        const endpoint = isRetry
          ? `/api/invoices/${invoiceId}/sync/retry`
          : `/api/invoices/${invoiceId}/sync`;

        const headers: Record<string, string> = {};
        if (duplicateConfirm) {
          headers["x-confirm-duplicate"] = "true";
          setDuplicateConfirm(null);
        }

        const res = await fetch(endpoint, { method: "POST", headers });
        const body = await res.json();

        if (!res.ok) {
          if (res.status === 409 && body.details?.requiresConfirmation) {
            setDuplicateConfirm({
              message: body.error,
              duplicates: body.details.duplicates,
            });
            setBarState("idle");
            return;
          }
          throw new Error(body.error ?? "Failed to sync invoice");
        }

        setBarState("synced");
        setSyncedEntityId(body.data?.billId ?? null);

        if (body.data?.warning) {
          setWarning(body.data.warning);
        }

        onStatusChange("synced");
      } catch (err) {
        setBarState("failed");
        const message = err instanceof Error ? err.message : "Failed to sync invoice";
        setErrorMessage(message);
        errorTimer.current = setTimeout(() => {
          setErrorMessage(null);
        }, 10000);
      }
    }
  }, [barState, canSync, duplicateConfirm, invoiceId, isRetry, onStatusChange]);

  // --- Render: pending_review phase (approve) ---
  if (currentStatus === "pending_review") {
    const buttonConfig: Record<
      "idle" | "approving" | "approved",
      { label: string; className: string; disabled: boolean }
    > = {
      idle: {
        label: "Approve Invoice",
        className: canApprove
          ? "bg-primary text-white hover:bg-primary-hover"
          : "bg-primary/50 text-white cursor-not-allowed",
        disabled: !canApprove,
      },
      approving: {
        label: "Approving...",
        className: "bg-primary/60 text-white cursor-not-allowed",
        disabled: true,
      },
      approved: {
        label: "Approved",
        className: "bg-accent text-white cursor-not-allowed",
        disabled: true,
      },
    };

    const approveState = barState as "idle" | "approving" | "approved";
    const btn = buttonConfig[approveState] ?? buttonConfig.idle;

    return (
      <div className="bg-white px-6 py-4 flex items-center justify-between gap-4">
        <div className="text-sm flex items-center gap-2 min-w-0">
          {barState === "approved" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">Invoice approved. Ready to sync.</span>
            </>
          ) : errorMessage ? (
            <>
              <span className="h-2 w-2 rounded-full bg-error shrink-0" />
              <span className="text-error truncate">{errorMessage}</span>
            </>
          ) : canApprove ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">Ready to approve</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
              <span className="text-warning">Missing: {missingFields.join(", ")}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleApprove}
          disabled={btn.disabled}
          className={`${btn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
        >
          {barState === "approving" && <SpinnerIcon />}
          {barState === "approved" && <CheckIcon />}
          {btn.label}
        </button>
      </div>
    );
  }

  // --- Render: synced phase (read-only) ---
  if (currentStatus === "synced") {
    return (
      <div className="bg-white px-6 py-4 space-y-2">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-accent">
            This invoice has been synced to {provider ? getProviderLabel(provider) : "your accounting software"}.
          </span>
          {syncedEntityId && provider && (
            <a
              href={getTransactionUrl(provider, outputType, syncedEntityId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:text-green-700 font-medium flex items-center gap-1 ml-1"
            >
              View in {getProviderLabel(provider)}
              <ExternalLinkIcon />
            </a>
          )}
        </div>
        {warning && <WarningBanner message={warning} />}
      </div>
    );
  }

  // --- Render: approved phase (sync) ---
  if (currentStatus !== "approved") return null;

  const syncButtonConfig: Record<
    "idle" | "confirming" | "syncing" | "synced" | "failed",
    { label: string; className: string; disabled: boolean }
  > = {
    idle: {
      label: isRetry
        ? `Retry Sync to ${provider ? getProviderLabel(provider) : "Accounting"}`
        : `Sync to ${provider ? getProviderLabel(provider) : "Accounting"}`,
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

  const syncState = barState as "idle" | "confirming" | "syncing" | "synced" | "failed";
  const syncBtn = syncButtonConfig[syncState] ?? syncButtonConfig.idle;

  return (
    <div className="bg-white px-6 py-4 space-y-2">
      {duplicateConfirm && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-2.5">
          <svg className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 text-xs text-amber-800">
            <p className="font-medium mb-1">{duplicateConfirm.message}</p>
            {duplicateConfirm.duplicates.map((d) => (
              <p key={d.invoiceId}>
                {d.vendorName}{d.invoiceNumber ? ` - ${d.invoiceNumber}` : ""}
              </p>
            ))}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                className="px-3 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                onClick={() => {
                  setBarState("confirming");
                  handleSync();
                }}
              >
                Sync Anyway
              </button>
              <button
                type="button"
                className="px-3 py-1 text-xs font-medium rounded border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                onClick={() => setDuplicateConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div className="text-sm flex items-center gap-2 min-w-0">
          {barState === "synced" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">
                Invoice synced to {provider ? getProviderLabel(provider) : "accounting"}.
              </span>
              {syncedEntityId && (
                <a
                  href={provider ? getTransactionUrl(provider, outputType, syncedEntityId) : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-green-700 font-medium flex items-center gap-1 ml-1"
                >
                  View in {provider ? getProviderLabel(provider) : "accounting"}
                  <ExternalLinkIcon />
                </a>
              )}
            </>
          ) : errorMessage ? (
            <>
              <span className="h-2 w-2 rounded-full bg-error shrink-0" />
              <span className="text-error truncate">{errorMessage}</span>
            </>
          ) : barState === "confirming" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse" />
              <span className="text-warning">Click again to confirm</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="text-muted">
                {barState === "failed" || isRetry
                  ? "Previous sync failed. Ready to retry."
                  : `Ready to sync to ${provider ? getProviderLabel(provider) : "accounting"}.`}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncBtn.disabled}
          className={`${syncBtn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
        >
          {barState === "syncing" && <SpinnerIcon />}
          {barState === "synced" && <CheckIcon />}
          {syncBtn.label}
        </button>
      </div>
      {warning && <WarningBanner message={warning} />}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
    </svg>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-2.5">
      <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <p className="text-xs text-warning">{message}</p>
    </div>
  );
}
