"use client";

import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";

export function EmailIngestionCard() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/email/address")
      .then((r) => r.json())
      .then((res) => {
        setAddress(res.data?.address ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleEnable() {
    setEnabling(true);
    try {
      const res = await fetch("/api/email/address", { method: "POST" });
      const data = await res.json();
      if (data.data?.address) {
        setAddress(data.data.address);
      }
    } catch {
      // Fail silently -- user can retry
    } finally {
      setEnabling(false);
    }
  }

  async function handleDisable() {
    setDisabling(true);
    try {
      await fetch("/api/email/address", { method: "DELETE" });
      setAddress(null);
      setShowConfirm(false);
    } catch {
      // Fail silently
    } finally {
      setDisabling(false);
    }
  }

  function extractPrefix(addr: string): string {
    return addr.split("@")[0];
  }

  function handleCopy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSavePrefix() {
    if (!prefix.trim()) return;
    setSaving(true);
    setPrefixError(null);
    try {
      const res = await fetch("/api/email/address", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefix.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPrefixError(data.error || "Failed to update prefix");
        return;
      }
      setAddress(data.data.address);
      setEditing(false);
      setPrefixError(null);
    } catch {
      setPrefixError("Failed to update prefix. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5">
        <div className="animate-pulse h-11 bg-gray-100 rounded-brand-md" />
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex items-center gap-5">
        {/* Email icon */}
        <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-blue-600 text-white font-bold text-sm flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
            <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-body font-bold text-[15px] text-text">
            Email Forwarding
          </p>
          <p className="font-body text-[13px] text-muted">
            {address
              ? "Forward invoices from your email to automatically extract and process them."
              : "Forward invoices from your email to automatically extract and process them."}
          </p>
        </div>

        {/* Action */}
        {!address && (
          <Button
            onClick={handleEnable}
            disabled={enabling}
          >
            {enabling ? "Enabling..." : "Enable"}
          </Button>
        )}
      </div>

      {/* Enabled state: show address + instructions */}
      {address && (
        <div className="mt-5 space-y-4">
          {/* Address display / edit */}
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Your forwarding address
            </label>

            {editing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-0">
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => {
                      setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                      setPrefixError(null);
                    }}
                    placeholder="your-prefix"
                    maxLength={20}
                    className="font-mono text-[14px] bg-white border border-border border-r-0 rounded-l-brand-md px-3 py-2 text-text w-40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePrefix();
                      if (e.key === "Escape") {
                        setEditing(false);
                        setPrefixError(null);
                      }
                    }}
                  />
                  <span className="font-mono text-[14px] bg-gray-100 border border-border border-l-0 rounded-r-brand-md px-3 py-2 text-muted select-none">
                    @ingest.dockett.app
                  </span>
                </div>
                {prefixError && (
                  <p className="text-[12px] text-red-600">{prefixError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSavePrefix}
                    disabled={saving || prefix.length < 3}
                    className="px-3 py-1.5 text-[13px] font-medium bg-blue-600 text-white rounded-brand-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setPrefixError(null);
                    }}
                    className="px-3 py-1.5 text-[13px] font-medium text-muted hover:text-text transition-colors"
                  >
                    Cancel
                  </button>
                  <p className="text-[12px] text-muted">
                    3-20 characters. Letters, numbers, hyphens.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={address}
                  className="flex-1 font-mono text-[14px] bg-gray-50 border border-border rounded-brand-md px-3 py-2 text-text select-all"
                />
                <button
                  onClick={() => {
                    setPrefix(extractPrefix(address!));
                    setEditing(true);
                  }}
                  className="px-3 py-2 text-[13px] font-medium text-muted border border-border rounded-brand-md hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Edit
                </button>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-brand-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>

          {/* Test email link */}
          <a
            href={`mailto:${address}?subject=Test%20Invoice&body=This%20is%20a%20test%20email%20to%20verify%20forwarding.`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2.87 2.298a.75.75 0 00-1.24.845L5.22 8 1.63 12.857a.75.75 0 001.24.845L7.25 8.5h5a.75.75 0 100-1.5h-5L2.87 2.298z" />
            </svg>
            Send a test email
          </a>

          {/* Setup hint */}
          <p className="text-[12px] text-muted">
            Forward invoices to this address. We'll take it from there.
          </p>

          {/* Disable button */}
          <div className="pt-2 border-t border-border">
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="text-[13px] font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                Disable Email Forwarding
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[13px] text-muted">
                  Emails to this address will no longer be processed.
                </p>
                <button
                  onClick={handleDisable}
                  disabled={disabling}
                  className="px-3 py-1.5 text-[13px] font-medium bg-red-600 text-white rounded-brand-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {disabling ? "Disabling..." : "Confirm"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="text-[13px] font-medium text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
