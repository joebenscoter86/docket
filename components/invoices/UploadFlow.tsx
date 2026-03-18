"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

export default function UploadFlow() {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { status, errorMessage } = useInvoiceStatus(invoiceId);

  const handleUploadComplete = useCallback((id: string) => {
    setInvoiceId(id);
  }, []);

  const handleUploadAnother = useCallback(() => {
    setInvoiceId(null);
    setRetryError(null);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!invoiceId) return;
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [invoiceId]);

  return (
    <>
      {!invoiceId ? (
        <UploadZone onUploadComplete={handleUploadComplete} />
      ) : (
        <div className="rounded-brand-lg border border-border bg-surface p-8">
          <ExtractionProgress
            invoiceId={invoiceId}
            status={status}
            errorMessage={errorMessage}
            retryError={retryError}
            onRetry={handleRetry}
            onUploadAnother={handleUploadAnother}
          />
        </div>
      )}
    </>
  );
}
