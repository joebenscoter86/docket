"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import UploadQueue from "@/components/invoices/UploadQueue";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

type FlowState =
  | { mode: "select" }
  | { mode: "single"; invoiceId: string }
  | { mode: "batch"; files: File[] };

export default function UploadFlow() {
  const [flow, setFlow] = useState<FlowState>({ mode: "select" });
  const [retryError, setRetryError] = useState<string | null>(null);

  const invoiceId = flow.mode === "single" ? flow.invoiceId : null;
  const { status, errorMessage } = useInvoiceStatus(invoiceId);

  const handleUploadComplete = useCallback((id: string) => {
    setFlow({ mode: "single", invoiceId: id });
  }, []);

  const handleUploadStart = useCallback((files: File[]) => {
    setFlow({ mode: "batch", files });
  }, []);

  const handleUploadAnother = useCallback(() => {
    setFlow({ mode: "select" });
    setRetryError(null);
  }, []);

  const handleRetry = useCallback(async () => {
    if (flow.mode !== "single") return;
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${flow.invoiceId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [flow]);

  if (flow.mode === "batch") {
    return <UploadQueue files={flow.files} onComplete={handleUploadAnother} />;
  }

  if (flow.mode === "single") {
    return (
      <div className="rounded-brand-lg border border-border bg-surface p-8">
        <ExtractionProgress
          invoiceId={flow.invoiceId}
          status={status}
          errorMessage={errorMessage}
          retryError={retryError}
          onRetry={handleRetry}
          onUploadAnother={handleUploadAnother}
        />
      </div>
    );
  }

  return (
    <UploadZone
      onUploadComplete={handleUploadComplete}
      onUploadStart={handleUploadStart}
    />
  );
}
