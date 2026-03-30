"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface XeroConnectionCardProps {
  connection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  };
  disabled?: boolean;
  disabledReason?: string;
}

export function XeroConnectionCard({ connection, disabled, disabledReason }: XeroConnectionCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/xero/disconnect", {
        method: "POST",
      });

      if (response.ok) {
        window.location.href = "/settings?xero_success=" + encodeURIComponent("Xero disconnected.");
      } else {
        window.location.href = "/settings?xero_error=" + encodeURIComponent("Failed to disconnect Xero.");
      }
    } catch {
      setDisconnecting(false);
      window.location.href = "/settings?xero_error=" + encodeURIComponent("Failed to disconnect Xero.");
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
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 flex items-center gap-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      {/* Xero Logo */}
      <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-[#13B5EA] flex-shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 5.5L12 13M12 13L19.5 5.5M12 13L4.5 20.5M12 13L19.5 20.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-body font-bold text-[15px] text-text">
          Xero
        </p>
        <p className="font-body text-[13px] text-muted">
          {connection.connected && connection.companyName
            ? `${connection.companyName}${connectedDate ? ` · Connected ${connectedDate}` : ""}`
            : "Connect your Xero account to sync invoices as bills."}
        </p>
      </div>

      {/* Right side: status + action */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {connection.connected ? (
          <>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#D1FAE5] text-[#065F46]">
              Connected
            </span>
            {showConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted">
                  Disconnect?
                </span>
                <Button
                  variant="danger"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="h-9 px-3 text-[13px]"
                >
                  {disconnecting ? "..." : "Yes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="h-9 px-3 text-[13px]"
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowConfirm(true)}
                className="text-error border-[#FECACA] h-9 px-3 text-[13px]"
              >
                Disconnect
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F5F9] text-muted">
              Not connected
            </span>
            {disabled ? (
              <span className="relative group">
                <button
                  disabled
                  className="h-9 px-3 text-[13px] rounded-brand-md border border-border text-muted cursor-not-allowed font-medium"
                >
                  Connect
                </button>
                {disabledReason && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-md bg-text px-3 py-2 text-xs text-white text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {disabledReason}
                  </span>
                )}
              </span>
            ) : (
              <a href="/api/xero/connect">
                <Button variant="outline" className="h-9 px-3 text-[13px]">
                  Connect
                </Button>
              </a>
            )}
          </>
        )}
      </div>
      {!connection.connected && !disabled && (
        <p className="text-xs text-muted mt-2">
          The person connecting needs Standard or Adviser access in Xero. Don&apos;t see your organization? Check your user permissions.
        </p>
      )}
    </div>
  );
}
