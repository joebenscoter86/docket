"use client";

import { useState } from "react";
import Link from "next/link";
import type { DuplicateMatch } from "@/lib/types/invoice";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DuplicateWarningBanner({
  matches,
}: {
  matches: DuplicateMatch[];
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || matches.length === 0) {
    return null;
  }

  const visible = matches.slice(0, 3);
  const remaining = matches.length - visible.length;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 md:px-6">
      <div className="flex items-start gap-2">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <div className="flex-1 space-y-1">
          {visible.map((match) => (
            <p key={match.invoiceId} className="text-sm text-amber-800">
              {match.matchType === "exact" ? (
                <>
                  Possible duplicate: {match.vendorName} -{" "}
                  {match.invoiceNumber} ({match.status}).{" "}
                  <Link
                    href={`/invoices/${match.invoiceId}/review`}
                    className="font-medium text-amber-600 underline hover:text-amber-800"
                  >
                    View
                  </Link>
                </>
              ) : (
                <>
                  Similar invoice found: {match.vendorName} -{" "}
                  {match.totalAmount != null
                    ? formatAmount(match.totalAmount)
                    : "N/A"}{" "}
                  on{" "}
                  {match.invoiceDate
                    ? formatDate(match.invoiceDate)
                    : "unknown date"}{" "}
                  ({match.status}).{" "}
                  <Link
                    href={`/invoices/${match.invoiceId}/review`}
                    className="font-medium text-amber-600 underline hover:text-amber-800"
                  >
                    View
                  </Link>
                </>
              )}
            </p>
          ))}
          {remaining > 0 && (
            <p className="text-sm text-amber-600">
              + {remaining} more
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-amber-500 hover:text-amber-700"
          aria-label="Dismiss duplicate warning"
        >
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
