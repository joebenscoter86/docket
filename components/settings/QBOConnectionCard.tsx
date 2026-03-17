"use client";

import { useState } from "react";

interface QBOConnectionCardProps {
  connection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  };
}

export function QBOConnectionCard({ connection }: QBOConnectionCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/quickbooks/disconnect", {
        method: "POST",
      });

      if (response.ok) {
        // Reload the page to reflect disconnected state
        window.location.href = "/settings?qbo_success=" + encodeURIComponent("QuickBooks disconnected.");
      } else {
        window.location.href = "/settings?qbo_error=" + encodeURIComponent("Failed to disconnect QuickBooks.");
      }
    } catch {
      setDisconnecting(false);
      window.location.href = "/settings?qbo_error=" + encodeURIComponent("Failed to disconnect QuickBooks.");
    }
  }

  const connectedDate = connection.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            QuickBooks Online
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Connect your QuickBooks account to sync invoices as bills.
          </p>
        </div>

        {/* Connection status indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              connection.connected ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <span className="text-sm font-medium text-gray-700">
            {connection.connected ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>

      {connection.connected ? (
        <div className="mt-4 space-y-4">
          {/* Connection details */}
          <div className="rounded-md bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                {connection.companyName && (
                  <p className="font-medium text-gray-900">
                    {connection.companyName}
                  </p>
                )}
                <p className="text-gray-500">
                  Company ID: {connection.companyId}
                </p>
                {connectedDate && (
                  <p className="text-gray-500">Connected {connectedDate}</p>
                )}
              </div>
            </div>
          </div>

          {/* Disconnect button with confirmation */}
          {showConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                Are you sure? This will stop all invoice syncing.
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Yes, disconnect"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <a
            href="/api/quickbooks/connect"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Connect QuickBooks
          </a>
        </div>
      )}
    </div>
  );
}
