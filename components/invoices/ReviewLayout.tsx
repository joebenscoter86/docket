"use client";

import { useState } from "react";
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
import type { InvoiceStatus, ExtractedDataRow, OutputType } from "@/lib/types/invoice";
import type { BatchManifestItem } from "@/lib/invoices/queries";

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
  };
  signedUrl: string;
  extractedData: ExtractedDataRow | null;
  orgDefaults: {
    defaultOutputType: OutputType;
    defaultPaymentAccountId: string | null;
    defaultPaymentAccountName: string | null;
  };
  batchManifest?: { id: string; status: string }[];
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
}: ReviewLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>("document");

  const confidence = extractedData?.confidence_score ?? null;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Batch navigation bar */}
      {invoice.batchId && batchManifest && batchManifest.length > 1 && (
        <BatchNavigation
          currentInvoiceId={invoice.id}
          batchId={invoice.batchId}
          initialManifest={batchManifest as BatchManifestItem[]}
        />
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
      <div className="flex flex-1 min-h-0">
        {/* Left panel: PDF viewer */}
        <div
          className={`${
            activeTab === "document" ? "flex" : "hidden"
          } md:flex w-full md:w-1/2 overflow-y-auto md:border-r md:border-border`}
        >
          <div className="flex-1">
            <PdfViewer signedUrl={signedUrl} fileType={invoice.fileType} />
          </div>
        </div>

        {/* Right panel: Extraction form */}
        <div
          className={`${
            activeTab === "details" ? "flex" : "hidden"
          } md:flex w-full md:w-1/2 overflow-y-auto`}
        >
          <div className="flex-1 p-4 md:p-6">
            {extractedData ? (
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
              />
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
