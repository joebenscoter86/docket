"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BatchManifestItem } from "@/lib/invoices/queries";
import { InvoiceStatus } from "@/lib/types/invoice";

interface BatchNavigationProps {
  currentInvoiceId: string;
  batchId: string;
  initialManifest: BatchManifestItem[];
}

export function BatchNavigation({
  currentInvoiceId,
  batchId,
  initialManifest,
}: BatchNavigationProps) {
  const router = useRouter();
  const [manifest, setManifest] =
    useState<BatchManifestItem[]>(initialManifest);

  // Subscribe to realtime updates for invoices in this batch
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`batch-nav-${batchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoices" },
        (payload) => {
          const updated = payload.new as { id: string; status: InvoiceStatus };
          setManifest((prev) => {
            if (!prev.some((m) => m.id === updated.id)) return prev;
            return prev.map((item) =>
              item.id === updated.id
                ? { ...item, status: updated.status }
                : item
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  const currentIndex = manifest.findIndex((m) => m.id === currentInvoiceId);
  const position = currentIndex === -1 ? 1 : currentIndex + 1;
  const total = manifest.length;

  const previousInvoice =
    currentIndex > 0 ? manifest[currentIndex - 1] : null;

  const nextInvoice =
    currentIndex < manifest.length - 1 ? manifest[currentIndex + 1] : null;

  const handleBack = () => {
    router.push(`/invoices?batch_id=${batchId}`);
  };

  const handlePrevious = () => {
    if (previousInvoice) {
      router.push(`/invoices/${previousInvoice.id}/review`);
    }
  };

  const handleNext = () => {
    if (nextInvoice) {
      router.push(`/invoices/${nextInvoice.id}/review`);
    }
  };

  const buttonClass =
    "px-2.5 py-1.5 rounded-md text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-1";

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white px-4 py-2.5 gap-2 sm:gap-0">
      {/* Back to batch */}
      <button
        onClick={handleBack}
        className={buttonClass}
        aria-label="Back to batch"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to batch
      </button>

      {/* Position counter + prev/next */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 font-medium px-2">
          Invoice {position} of {total}
        </span>

        <button
          onClick={handlePrevious}
          disabled={!previousInvoice}
          className={buttonClass}
          aria-label="Previous invoice"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Previous
        </button>

        <button
          onClick={handleNext}
          disabled={!nextInvoice}
          className={buttonClass}
          aria-label="Next invoice"
        >
          Next
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
