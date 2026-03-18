"use client";

import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types/invoice";

type StepState = "complete" | "active" | "pending" | "error";

interface ExtractionProgressProps {
  invoiceId: string;
  status: InvoiceStatus | null;
  errorMessage: string | null;
  retryError?: string | null;
  onRetry: () => void;
  onUploadAnother: () => void;
}

const STEPS = ["Uploaded", "Extracting data", "Ready for review"] as const;

function getStepStates(status: InvoiceStatus | null): [StepState, StepState, StepState] {
  switch (status) {
    case "uploading":
      return ["active", "pending", "pending"];
    case "extracting":
      return ["complete", "active", "pending"];
    case "pending_review":
    case "approved":
    case "synced":
      return ["complete", "complete", "complete"];
    case "error":
      return ["complete", "error", "pending"];
    case null:
    default:
      return ["pending", "pending", "pending"];
  }
}

function getAnnouncement(status: InvoiceStatus | null): string {
  switch (status) {
    case "uploading":
      return "Upload in progress";
    case "extracting":
      return "Extracting invoice data";
    case "pending_review":
    case "approved":
    case "synced":
      return "Extraction complete. Ready for review.";
    case "error":
      return "Extraction failed";
    default:
      return "";
  }
}

function StepIcon({ state }: { state: StepState }) {
  const baseClasses = "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300";

  switch (state) {
    case "complete":
      return (
        <div className={`${baseClasses} bg-accent/10`} data-testid="step-icon">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case "active":
      return (
        <div className={`${baseClasses} bg-primary/10`} data-testid="step-icon">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </span>
        </div>
      );
    case "pending":
      return (
        <div className={`${baseClasses} bg-background`} data-testid="step-icon">
          <span className="h-2 w-2 rounded-full bg-muted" />
        </div>
      );
    case "error":
      return (
        <div className={`${baseClasses} bg-error/10`} data-testid="step-icon">
          <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
  }
}

function getStepTextColor(state: StepState): string {
  switch (state) {
    case "complete":
      return "text-accent";
    case "active":
      return "text-primary";
    case "error":
      return "text-error";
    case "pending":
      return "text-muted";
  }
}

function getConnectorColor(fromState: StepState, toState: StepState): string {
  if (fromState === "complete" && toState !== "pending") {
    return "bg-green-400";
  }
  return "bg-border";
}

const isCompletionStatus = (status: InvoiceStatus | null): boolean =>
  status === "pending_review" || status === "approved" || status === "synced";

export default function ExtractionProgress({
  invoiceId,
  status,
  errorMessage,
  retryError,
  onRetry,
  onUploadAnother,
}: ExtractionProgressProps) {
  const stepStates = getStepStates(status);
  const announcement = getAnnouncement(status);

  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="w-full max-w-xs">
        {STEPS.map((label, index) => (
          <div key={label}>
            <div
              data-step
              data-state={stepStates[index]}
              className="flex items-center gap-3 transition-all duration-300"
            >
              <StepIcon state={stepStates[index]} />
              <span className={`text-sm font-medium transition-colors duration-300 ${getStepTextColor(stepStates[index])}`}>
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`ml-[13px] w-px h-6 transition-colors duration-500 ${getConnectorColor(stepStates[index], stepStates[index + 1])}`}
              />
            )}
          </div>
        ))}
      </div>

      {status === "error" && (
        <div className="text-center space-y-3">
          {errorMessage && (
            <p className="text-sm text-error">{errorMessage}</p>
          )}
          {retryError && (
            <p className="text-sm text-error">{retryError}</p>
          )}
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-md font-medium text-sm bg-error text-white hover:bg-red-700 transition-colors duration-300"
          >
            Retry
          </button>
        </div>
      )}

      {isCompletionStatus(status) && (
        <Link
          href={`/invoices/${invoiceId}/review`}
          className="px-4 py-2 rounded-md font-medium text-sm bg-primary text-white hover:bg-primary-hover transition-colors duration-300 animate-fade-in"
        >
          Review Invoice
        </Link>
      )}

      <button
        onClick={onUploadAnother}
        className="text-sm text-muted hover:text-text transition-colors duration-300"
      >
        Upload another
      </button>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
