"use client";

import { useState, useRef, useCallback, useEffect, useId } from "react";
import Link from "next/link";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center animate-pulse">
        <p className="text-sm text-muted">Loading document viewer...</p>
      </div>
    </div>
  ),
});
import ExtractionForm from "./ExtractionForm";
import { BatchNavigation } from "./BatchNavigation";
import DuplicateWarningBanner from "./DuplicateWarningBanner";
import type { InvoiceStatus, ExtractedDataRow, OutputType, DuplicateMatch } from "@/lib/types/invoice";
import type { BatchManifestItem } from "@/lib/invoices/queries";
import type { AccountingProviderType } from "@/lib/accounting/types";
import type { ActivityEvent } from "@/lib/invoices/activity";
import ActivityFeed from "./ActivityFeed";

interface ReviewLayoutProps {
  invoice: {
    id: string;
    fileName: string;
    fileType: string;
    status: InvoiceStatus;
    errorMessage?: string | null;
    outputType: OutputType;
    paymentAccountId: string | null;
    paymentAccountName: string | null;
    batchId: string | null;
    xeroBillStatus?: "DRAFT" | "AUTHORISED" | null;
    taxTreatment?: "exclusive" | "inclusive" | "no_tax" | null;
  };
  signedUrl: string;
  extractedData: ExtractedDataRow | null;
  orgDefaults: {
    defaultOutputType: OutputType;
    defaultPaymentAccountId: string | null;
    defaultPaymentAccountName: string | null;
  };
  batchManifest?: { id: string; status: string }[];
  accountingProvider?: AccountingProviderType | null;
  activityEvents?: ActivityEvent[];
}

type MobileTab = "document" | "details";

const CONFIDENCE_CONFIG = {
  high: { dotClass: "bg-accent", label: "High confidence" },
  medium: { dotClass: "bg-warning", label: "Medium confidence" },
  low: { dotClass: "bg-error", label: "Low confidence" },
} as const;

export default function ReviewLayout({
  invoice,
  signedUrl,
  extractedData,
  orgDefaults,
  batchManifest,
  accountingProvider,
  activityEvents,
}: ReviewLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>("document");
  const [leftPct, setLeftPct] = useState(50);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const scopeId = useId().replace(/:/g, "");

  const stopDragging = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dividerRef.current?.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(75, Math.max(25, pct)));
  }, []);

  // Clean up body styles on unmount and handle pointer-leave-window
  useEffect(() => {
    const onPointerUp = () => { if (isDragging.current) stopDragging(); };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [stopDragging]);

  const confidence = extractedData?.confidence_score ?? null;

  return (
    <div className={`flex flex-col -m-6 md:-m-8 lg:-m-10 review-root-${scopeId}`} style={{ height: 'calc(100% + 48px)' }}>
      <style>{`
        @media (min-width: 768px) {
          .rp-left-${scopeId} { width: ${leftPct}% !important; flex: none !important; }
          .rp-right-${scopeId} { width: ${100 - leftPct}% !important; flex: none !important; }
          .review-root-${scopeId} { height: calc(100% + 64px) !important; }
        }
        @media (min-width: 1024px) {
          .review-root-${scopeId} { height: calc(100% + 80px) !important; }
        }
        #app-footer { display: none; }
      `}</style>
      {/* Batch navigation bar */}
      {invoice.batchId && batchManifest && batchManifest.length > 1 && (
        <BatchNavigation
          currentInvoiceId={invoice.id}
          batchId={invoice.batchId}
          initialManifest={batchManifest as BatchManifestItem[]}
        />
      )}
      {/* Duplicate warning banner */}
      {extractedData?.duplicate_matches && extractedData.duplicate_matches.length > 0 && (
        <DuplicateWarningBanner matches={extractedData.duplicate_matches as DuplicateMatch[]} />
      )}
      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 md:px-6">
        {/* Back button — hidden when batch nav is present (it has its own "Back to batch") */}
        {!invoice.batchId && (
          <Link
            href="/invoices"
            className="flex items-center gap-1 text-sm text-muted hover:text-text transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span className="hidden md:inline">Back to Invoices</span>
            <span className="sr-only md:hidden">Back</span>
          </Link>
        )}

        {/* File name */}
        <span className="truncate text-sm font-medium text-text min-w-0">
          {invoice.fileName}
        </span>

        {/* Status + confidence (right side) */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <InvoiceStatusBadge status={invoice.status} />
          {confidence && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${CONFIDENCE_CONFIG[confidence].dotClass}`} />
              {CONFIDENCE_CONFIG[confidence].label}
            </span>
          )}
          {confidence && (
            <span className="flex md:hidden items-center">
              <span className={`h-2 w-2 rounded-full ${CONFIDENCE_CONFIG[confidence].dotClass}`} />
            </span>
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex border-b border-border bg-white md:hidden" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "document"}
          onClick={() => setActiveTab("document")}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            activeTab === "document"
              ? "text-primary border-b-2 border-primary"
              : "text-muted hover:text-text"
          }`}
        >
          Document
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "details"}
          onClick={() => setActiveTab("details")}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            activeTab === "details"
              ? "text-primary border-b-2 border-primary"
              : "text-muted hover:text-text"
          }`}
        >
          Details
        </button>
      </div>

      {/* Two-panel content area */}
      <div
        ref={containerRef}
        className="flex flex-1 min-h-0"
        onPointerMove={handlePointerMove}
      >
        {/* Left panel: PDF viewer */}
        <div
          className={`${
            activeTab === "document" ? "flex" : "hidden"
          } md:flex w-full overflow-y-auto rp-left-${scopeId}`}
        >
          <div className="flex-1">
            <PdfViewer signedUrl={signedUrl} fileType={invoice.fileType} />
          </div>
        </div>

        {/* Draggable divider */}
        <div
          ref={dividerRef}
          className="hidden md:flex items-center justify-center w-0 relative cursor-col-resize select-none z-10 group touch-none"
          onPointerDown={handlePointerDown}
        >
          {/* Wide hit target */}
          <div className="absolute inset-y-0 -left-1.5 -right-1.5 w-3" />
          {/* Visible line */}
          <div className="h-full w-px bg-border group-hover:w-[3px] group-hover:bg-primary/40 transition-all duration-150" />
        </div>

        {/* Right panel: Extraction form */}
        <div
          className={`${
            activeTab === "details" ? "flex" : "hidden"
          } md:flex w-full overflow-y-auto rp-right-${scopeId}`}
        >
          <div className="flex-1 p-4 md:p-6 bg-background">
            {extractedData ? (
              <>
                <ExtractionForm
                  extractedData={extractedData}
                  invoiceId={invoice.id}
                  invoiceStatus={invoice.status}
                  errorMessage={invoice.errorMessage}
                  outputType={invoice.outputType}
                  paymentAccountId={invoice.paymentAccountId}
                  paymentAccountName={invoice.paymentAccountName}
                  orgDefaults={orgDefaults}
                  batchId={invoice.batchId}
                  batchManifest={batchManifest}
                  accountingProvider={accountingProvider ?? null}
                  xeroBillStatus={invoice.xeroBillStatus ?? null}
                  taxTreatment={invoice.taxTreatment ?? null}
                />
                {activityEvents && activityEvents.length > 0 && (
                  <ActivityFeed events={activityEvents} />
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted">
                <div className="text-center">
                  <p>No extraction data found.</p>
                  <p className="mt-1">Please retry extraction.</p>
                  <Link
                    href="/invoices"
                    className="mt-3 inline-block text-primary hover:text-primary-hover text-sm"
                  >
                    Back to Invoices
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
