"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type ApproveBarState = "idle" | "confirming" | "submitting" | "approved";

interface ApproveBarProps {
  invoiceId: string;
  vendorName: string | number | null;
  totalAmount: string | number | null;
}

export default function ApproveBar({
  invoiceId,
  vendorName,
  totalAmount,
}: ApproveBarProps) {
  const [barState, setBarState] = useState<ApproveBarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  // Validation
  const missingFields: string[] = [];
  const vendorStr = String(vendorName ?? "").trim();
  if (!vendorStr) missingFields.push("vendor name");
  if (totalAmount === null || totalAmount === undefined || String(totalAmount).trim() === "") {
    missingFields.push("total amount");
  }
  const canApprove = missingFields.length === 0;

  const handleApprove = useCallback(async () => {
    if (barState === "idle") {
      // First click → enter confirming state
      setBarState("confirming");
      setErrorMessage(null);
      confirmTimer.current = setTimeout(() => {
        setBarState("idle");
      }, 3000);
      return;
    }

    if (barState === "confirming") {
      // Second click → fire API call
      if (confirmTimer.current) clearTimeout(confirmTimer.current);

      // Blur active element to trigger pending auto-saves
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      // Wait for auto-save to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      setBarState("submitting");
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
        // Hard navigate after showing success — router.push uses stale client cache
        redirectTimer.current = setTimeout(() => {
          window.location.href = "/invoices";
        }, 2000);
      } catch (err) {
        setBarState("idle");
        const message = err instanceof Error ? err.message : "Failed to approve invoice";
        setErrorMessage(message);
        // Auto-dismiss error after 5 seconds
        errorTimer.current = setTimeout(() => {
          setErrorMessage(null);
        }, 5000);
      }
    }
  }, [barState, invoiceId]);

  // Button config by state
  const buttonConfig = {
    idle: {
      label: "Approve Invoice",
      className: canApprove
        ? "bg-primary text-white hover:bg-primary-hover"
        : "bg-primary/50 text-white cursor-not-allowed",
      disabled: !canApprove,
    },
    confirming: {
      label: "Confirm Approval",
      className: "bg-accent text-white hover:bg-green-700",
      disabled: false,
    },
    submitting: {
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

  const btn = buttonConfig[barState];

  return (
    <div className="bg-white px-6 py-4 flex items-center justify-between gap-4">
      {/* Left side: status message */}
      <div className="text-sm flex items-center gap-2 min-w-0">
        {barState === "approved" ? (
          <>
            <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
            <span className="text-accent">
              Invoice approved. Ready to sync to QuickBooks.
            </span>
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
            <span className="text-warning">
              Missing: {missingFields.join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Right side: approve button */}
      <button
        type="button"
        onClick={handleApprove}
        disabled={btn.disabled}
        className={`${btn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
      >
        {barState === "submitting" && (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
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
        )}
        {barState === "approved" && (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {btn.label}
      </button>
    </div>
  );
}
