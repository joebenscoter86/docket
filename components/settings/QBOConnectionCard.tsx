"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

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
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 flex items-center gap-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      {/* QB Logo */}
      <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-[#2CA01C] text-white font-bold text-sm flex-shrink-0">
        QB
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-body font-bold text-[15px] text-text">
          QuickBooks Online
        </p>
        <p className="font-body text-[13px] text-muted">
          {connection.connected && connection.companyName
            ? `${connection.companyName}${connectedDate ? ` · Connected ${connectedDate}` : ""}`
            : "Connect your QuickBooks account to sync invoices as bills."}
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
            <a href="/api/quickbooks/connect">
              <Button variant="outline" className="h-9 px-3 text-[13px]">
                Connect
              </Button>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
