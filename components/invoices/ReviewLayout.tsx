"use client";

import { useState } from "react";
import Link from "next/link";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PdfViewer from "./PdfViewer";
import ExtractionForm from "./ExtractionForm";
import type { InvoiceStatus } from "@/lib/types/invoice";

interface ReviewLayoutProps {
  invoice: {
    id: string;
    fileName: string;
    fileType: string;
    status: InvoiceStatus;
  };
  signedUrl: string;
  extractedData: {
    id: string;
    confidence_score: "high" | "medium" | "low";
    [key: string]: unknown;
    extracted_line_items: Array<{
      id: string;
      [key: string]: unknown;
    }>;
  } | null;
}

type MobileTab = "document" | "details";

const CONFIDENCE_CONFIG = {
  high: { dotClass: "bg-green-500", label: "High confidence" },
  medium: { dotClass: "bg-amber-500", label: "Medium confidence" },
  low: { dotClass: "bg-red-500", label: "Low confidence" },
} as const;

export default function ReviewLayout({
  invoice,
  signedUrl,
  extractedData,
}: ReviewLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>("document");

  const confidence = extractedData?.confidence_score ?? null;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
        {/* Back button */}
        <Link
          href="/invoices"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0"
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

        {/* File name */}
        <span className="truncate text-sm font-medium text-slate-800 min-w-0">
          {invoice.fileName}
        </span>

        {/* Status + confidence (right side) */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <InvoiceStatusBadge status={invoice.status} />
          {confidence && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-gray-500">
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
      <div className="flex border-b border-gray-200 bg-white md:hidden" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "document"}
          onClick={() => setActiveTab("document")}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            activeTab === "document"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
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
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
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
          } md:flex w-full md:w-1/2 overflow-y-auto md:border-r md:border-gray-200`}
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
              <ExtractionForm extractedData={extractedData} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                <div className="text-center">
                  <p>No extraction data found.</p>
                  <p className="mt-1">Please retry extraction.</p>
                  <Link
                    href="/invoices"
                    className="mt-3 inline-block text-blue-600 hover:text-blue-700 text-sm"
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
