"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";
import type { InvoiceStatus } from "@/lib/types/invoice";

interface ReviewProcessingStateProps {
  invoiceId: string;
  initialStatus: InvoiceStatus;
}

export default function ReviewProcessingState({
  invoiceId,
  initialStatus,
}: ReviewProcessingStateProps) {
  const router = useRouter();
  const { status, errorMessage } = useInvoiceStatus(invoiceId);
  const [retryError, setRetryError] = useState<string | null>(null);
  const hasRefreshed = useRef(false);

  // Use realtime status if available, fall back to initial
  const currentStatus = status ?? initialStatus;

  // Refresh page when extraction completes so server component loads extracted data
  useEffect(() => {
    if (currentStatus === "pending_review" && !hasRefreshed.current) {
      hasRefreshed.current = true;
      router.refresh();
    }
  }, [currentStatus, router]);

  const handleRetry = useCallback(async () => {
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [invoiceId]);

  const handleUploadAnother = useCallback(() => {
    router.push("/upload");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <ExtractionProgress
        invoiceId={invoiceId}
        status={currentStatus}
        errorMessage={errorMessage}
        retryError={retryError}
        onRetry={handleRetry}
        onUploadAnother={handleUploadAnother}
      />
    </div>
  );
}
