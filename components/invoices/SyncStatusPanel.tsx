"use client";

import { useState, useEffect, useCallback } from "react";

interface SyncLogEntry {
  id: string;
  provider: string;
  provider_bill_id: string | null;
  status: "success" | "failed" | "retrying";
  synced_at: string;
  provider_response: Record<string, unknown> | null;
}

interface SyncStatusPanelProps {
  invoiceId: string;
  invoiceStatus: string;
}

function formatSyncTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getErrorMessage(entry: SyncLogEntry): string {
  const response = entry.provider_response;
  if (!response) return "Unknown error";
  if (typeof response.detail === "string") return response.detail;
  if (typeof response.code === "string") return `Error code: ${response.code}`;
  return "Sync failed. Please try again.";
}

export default function SyncStatusPanel({
  invoiceId,
  invoiceStatus,
}: SyncStatusPanelProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/sync/log`);
      if (res.ok) {
        const body = await res.json();
        setLogs(body.data?.logs ?? []);
      }
    } catch {
      // Silently fail — sync log is non-critical UI
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Only show for approved/synced invoices, or if there are log entries
  if (invoiceStatus !== "approved" && invoiceStatus !== "synced" && logs.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading sync status...
      </div>
    );
  }

  if (logs.length === 0) {
    return null;
  }

  const latestLog = logs[0];
  const hasFailures = logs.some((l) => l.status === "failed");
  const previousLogs = logs.slice(1);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Sync Status
      </h3>

      {/* Latest sync attempt */}
      <div
        className={`rounded-md border p-3 ${
          latestLog.status === "success"
            ? "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex items-start gap-2">
          {latestLog.status === "success" ? (
            <svg className="h-5 w-5 text-green-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-red-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-sm font-medium ${
                  latestLog.status === "success" ? "text-green-800" : "text-red-800"
                }`}
              >
                {latestLog.status === "success"
                  ? "Synced to QuickBooks"
                  : "Sync Failed"}
              </span>
              <span className="text-xs text-gray-500 shrink-0">
                {formatSyncTime(latestLog.synced_at)}
              </span>
            </div>

            {latestLog.status === "success" && latestLog.provider_bill_id && (
              <p className="text-sm text-green-700 mt-1">
                Bill ID: <span className="font-mono">{latestLog.provider_bill_id}</span>
              </p>
            )}

            {latestLog.status === "failed" && (
              <p className="text-sm text-red-700 mt-1">
                {getErrorMessage(latestLog)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Previous attempts (expandable) */}
      {previousLogs.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {previousLogs.length} previous attempt{previousLogs.length !== 1 ? "s" : ""}
            {hasFailures && !expanded && (
              <span className="text-red-500 ml-1">
                ({logs.filter((l) => l.status === "failed").length} failed)
              </span>
            )}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              {previousLogs.map((log) => (
                <div
                  key={log.id}
                  className={`text-sm rounded-md border px-3 py-2 ${
                    log.status === "success"
                      ? "border-green-100 bg-green-50/50"
                      : "border-red-100 bg-red-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          log.status === "success" ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className={log.status === "success" ? "text-green-700" : "text-red-700"}>
                        {log.status === "success" ? "Success" : "Failed"}
                      </span>
                      {log.provider_bill_id && (
                        <span className="text-gray-500 font-mono text-xs">
                          Bill {log.provider_bill_id}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatSyncTime(log.synced_at)}
                    </span>
                  </div>
                  {log.status === "failed" && (
                    <p className="text-xs text-red-600 mt-1 pl-4">
                      {getErrorMessage(log)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
