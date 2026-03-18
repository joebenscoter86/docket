"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

export default function UploadPage() {
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
    <div className="mx-auto max-w-2xl">
      <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
      <p className="font-body text-[15px] text-muted mt-2">Drop your PDF or image files — AI will extract the data automatically.</p>
      <div className="mt-6">
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
      </div>
    </div>
  );
}
