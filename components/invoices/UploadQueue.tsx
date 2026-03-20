"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useInvoiceStatuses } from "@/lib/hooks/useInvoiceStatuses";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileUploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "extracting"
  | "pending_review"
  | "approved"
  | "synced"
  | "error";

interface FileUploadEntry {
  id: string;
  file: File;
  status: FileUploadStatus;
  invoiceId: string | null;
  errorMessage: string | null;
  usageLimitHit: boolean;
}

interface UploadQueueProps {
  files: File[];
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Concurrency limiter (simplified — no timeout)
// ---------------------------------------------------------------------------

function createLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const execute = queue.shift()!;
      execute();
    }
  }

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const execute = () => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              activeCount--;
              next();
            });
        };

        if (activeCount < concurrency) {
          activeCount++;
          execute();
        } else {
          queue.push(execute);
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<FileUploadStatus, string> = {
  queued: "Queued",
  uploading: "Uploading...",
  uploaded: "Uploaded",
  extracting: "Extracting data...",
  pending_review: "Ready for review",
  approved: "Approved",
  synced: "Synced",
  error: "Failed",
};

const STATUS_COLORS: Record<FileUploadStatus, string> = {
  queued: "text-muted",
  uploading: "text-muted",
  uploaded: "text-blue-600",
  extracting: "text-blue-600",
  pending_review: "text-green-600",
  approved: "text-green-600",
  synced: "text-green-600",
  error: "text-red-600",
};

function isTerminalUploadStatus(status: FileUploadStatus): boolean {
  return status !== "queued" && status !== "uploading";
}

function isSuccessUploadStatus(status: FileUploadStatus): boolean {
  return status !== "queued" && status !== "uploading" && status !== "error";
}

function getProgressBarColor(status: FileUploadStatus): string {
  if (status === "error") return "bg-red-500";
  if (status === "pending_review" || status === "approved" || status === "synced")
    return "bg-green-500";
  return "bg-[#3B82F6]";
}

function getProgressBarWidth(status: FileUploadStatus): string {
  switch (status) {
    case "queued":
      return "0%";
    case "uploading":
      return "40%";
    case "uploaded":
      return "60%";
    case "extracting":
      return "75%";
    case "pending_review":
    case "approved":
    case "synced":
      return "100%";
    case "error":
      return "100%";
    default:
      return "0%";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UploadQueue({ files, onComplete }: UploadQueueProps) {
  const batchId = useRef(crypto.randomUUID());
  const cancelledRef = useRef(false);
  const limiterRef = useRef(createLimit(3));
  const hasStartedRef = useRef(false);

  const [entries, setEntries] = useState<FileUploadEntry[]>(() =>
    files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued" as FileUploadStatus,
      invoiceId: null,
      errorMessage: null,
      usageLimitHit: false,
    }))
  );

  // Collect invoice IDs for real-time status tracking
  const invoiceIds = useMemo(
    () => entries.filter((e) => e.invoiceId).map((e) => e.invoiceId!),
    [entries]
  );

  const { statuses } = useInvoiceStatuses(invoiceIds);

  // Merge realtime statuses into entries
  const mergedEntries = useMemo(() => {
    return entries.map((entry) => {
      if (!entry.invoiceId || !statuses[entry.invoiceId]) return entry;
      const realtimeStatus = statuses[entry.invoiceId];
      // Only update if the realtime status is newer/different
      if (realtimeStatus.status !== entry.status) {
        return {
          ...entry,
          status: realtimeStatus.status as FileUploadStatus,
          errorMessage: realtimeStatus.errorMessage ?? entry.errorMessage,
        };
      }
      return entry;
    });
  }, [entries, statuses]);

  // Update entry helper
  const updateEntry = useCallback(
    (id: string, updates: Partial<FileUploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
    },
    []
  );

  // Cancel remaining queued files
  const cancelRemaining = useCallback(() => {
    cancelledRef.current = true;
    setEntries((prev) =>
      prev.map((e) =>
        e.status === "queued"
          ? { ...e, status: "error", errorMessage: "Monthly limit reached.", usageLimitHit: true }
          : e
      )
    );
  }, []);

  // Upload a single file
  const uploadFile = useCallback(
    async (entry: FileUploadEntry) => {
      if (cancelledRef.current) {
        updateEntry(entry.id, {
          status: "error",
          errorMessage: "Monthly limit reached.",
          usageLimitHit: true,
        });
        return;
      }

      updateEntry(entry.id, { status: "uploading" });

      const formData = new FormData();
      formData.append("file", entry.file);
      formData.append("batch_id", batchId.current);

      try {
        const res = await fetch("/api/invoices/upload", {
          method: "POST",
          body: formData,
        });
        const body = await res.json();

        if (!res.ok) {
          if (body.code === "USAGE_LIMIT") {
            updateEntry(entry.id, {
              status: "error",
              errorMessage: "Monthly limit reached.",
              usageLimitHit: true,
            });
            cancelRemaining();
            return;
          }
          updateEntry(entry.id, {
            status: "error",
            errorMessage: body.error || "Upload failed.",
          });
          return;
        }

        updateEntry(entry.id, {
          status: "uploaded",
          invoiceId: body.data.invoiceId,
        });
      } catch {
        updateEntry(entry.id, {
          status: "error",
          errorMessage: "Upload failed. Check connection.",
        });
      }
    },
    [updateEntry, cancelRemaining]
  );

  // Retry a failed upload
  const handleRetry = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;

      // Reset entry state, then re-upload
      updateEntry(entryId, {
        status: "uploading",
        errorMessage: null,
        invoiceId: null,
        usageLimitHit: false,
      });

      const formData = new FormData();
      formData.append("file", entry.file);
      formData.append("batch_id", batchId.current);

      fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) {
            updateEntry(entryId, {
              status: "error",
              errorMessage: body.error || "Upload failed.",
            });
            return;
          }
          updateEntry(entryId, {
            status: "uploaded",
            invoiceId: body.data.invoiceId,
          });
        })
        .catch(() => {
          updateEntry(entryId, {
            status: "error",
            errorMessage: "Upload failed. Check connection.",
          });
        });
    },
    [entries, updateEntry]
  );

  // Start uploads on mount
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const limiter = limiterRef.current;
    for (const entry of entries) {
      limiter.run(() => uploadFile(entry));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // beforeunload handler — only when files are uploading
  const hasUploading = mergedEntries.some((e) => e.status === "uploading");

  useEffect(() => {
    if (!hasUploading) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUploading]);

  // Fire onComplete when all uploads reach terminal status
  const allTerminal = mergedEntries.every((e) => isTerminalUploadStatus(e.status));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasFiredComplete = useRef(false);

  useEffect(() => {
    if (allTerminal && mergedEntries.length > 0 && !hasFiredComplete.current) {
      hasFiredComplete.current = true;
      onCompleteRef.current?.();
    }
  }, [allTerminal, mergedEntries.length]);

  // Batch summary stats
  const successCount = mergedEntries.filter((e) => isSuccessUploadStatus(e.status)).length;
  const failedCount = mergedEntries.filter((e) => e.status === "error").length;
  const totalCount = mergedEntries.length;

  return (
    <div className="space-y-3">
      {/* File rows */}
      {mergedEntries.map((entry) => (
        <div
          key={entry.id}
          className="relative bg-surface rounded-brand-lg shadow-soft overflow-hidden"
        >
          <div className="flex items-center justify-between h-16 px-4">
            {/* File icon + name */}
            <div className="flex items-center gap-3 min-w-0">
              <svg
                className="h-5 w-5 flex-shrink-0 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <span className="text-sm font-medium text-text truncate">
                {entry.file.name}
              </span>
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-sm ${STATUS_COLORS[entry.status]}`}>
                {entry.errorMessage && entry.status === "error"
                  ? entry.errorMessage
                  : STATUS_LABELS[entry.status]}
              </span>

              {/* View link for completed extractions */}
              {entry.invoiceId &&
                (entry.status === "pending_review" ||
                  entry.status === "approved" ||
                  entry.status === "synced") && (
                  <Link
                    href={`/invoices/${entry.invoiceId}/review`}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View &rarr;
                  </Link>
                )}

              {/* Retry button for failed uploads */}
              {entry.status === "error" && !entry.usageLimitHit && (
                <button
                  type="button"
                  onClick={() => handleRetry(entry.id)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-brand-md px-3 py-1 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>

          {/* Progress bar at bottom of row */}
          <div className="h-[3px] w-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ease-out ${getProgressBarColor(entry.status)}`}
              style={{ width: getProgressBarWidth(entry.status) }}
            />
          </div>
        </div>
      ))}

      {/* Batch summary */}
      {allTerminal && mergedEntries.length > 0 && (
        <div className="flex items-center justify-between bg-surface rounded-brand-lg shadow-soft px-4 py-3 mt-4">
          <div className="text-sm text-text">
            <span className="font-medium">
              {successCount} of {totalCount}
            </span>{" "}
            invoices uploaded successfully.
            {failedCount > 0 && (
              <span className="text-red-600 ml-1">{failedCount} failed.</span>
            )}
          </div>
          {successCount > 0 && (
            <Link
              href={`/invoices?batch_id=${batchId.current}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Review All &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
