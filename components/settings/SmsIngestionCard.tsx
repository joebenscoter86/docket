"use client";

import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";

type CardState = "loading" | "not_registered" | "verify_pending" | "verified";

function formatPhoneDisplay(e164: string): string {
  // +15551234567 -> (555) 123-4567
  const digits = e164.replace(/^\+1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatDocketNumber(e164: string): string {
  // +18555073460 -> (855) 507-3460
  const digits = e164.replace(/^\+1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function SmsIngestionCard() {
  const [state, setState] = useState<CardState>("loading");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [docketNumber, setDocketNumber] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/sms/phone")
      .then((r) => r.json())
      .then((res) => {
        setDocketNumber(res.data?.docketNumber ?? "");
        if (res.data?.phoneNumber) {
          setPhoneNumber(res.data.phoneNumber);
          setState("verified");
        } else {
          setState("not_registered");
        }
      })
      .catch(() => setState("not_registered"));
  }, []);

  function toE164(input: string): string {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return "";
  }

  async function handleSendCode() {
    const e164 = toE164(phoneInput);
    if (!e164) {
      setError("Enter a valid US phone number.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sms/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: e164 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send code.");
        return;
      }
      setPendingPhone(e164);
      setState("verify_pending");
    } catch {
      setError("Failed to send code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (verifyCode.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/sms/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pendingPhone, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }
      setPhoneNumber(pendingPhone);
      setState("verified");
      setVerifyCode("");
      setPendingPhone("");
      setPhoneInput("");
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch("/api/sms/phone", { method: "DELETE" });
      setPhoneNumber("");
      setState("not_registered");
      setShowConfirm(false);
    } catch {
      // Fail silently
    } finally {
      setRemoving(false);
    }
  }

  function handleCopyDocketNumber() {
    navigator.clipboard.writeText(docketNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "loading") {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5">
        <div className="animate-pulse h-11 bg-gray-100 rounded-brand-md" />
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex items-center gap-5">
        {/* Phone icon */}
        <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-green-600 text-white font-bold text-sm flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-body font-bold text-[15px] text-text">
            SMS Ingestion
          </p>
          <p className="font-body text-[13px] text-muted">
            Text photos of invoices and receipts to process them instantly.
          </p>
        </div>

        {/* Action for not_registered */}
        {state === "not_registered" && !phoneInput && (
          <Button onClick={() => setPhoneInput(" ")}>
            Add Phone Number
          </Button>
        )}
      </div>

      {/* Not registered: phone input */}
      {state === "not_registered" && phoneInput !== "" && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Your phone number
            </label>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneInput === " " ? "" : phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setError(null);
                }}
                placeholder="(555) 123-4567"
                className="flex-1 font-mono text-[14px] bg-white border border-border rounded-brand-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendCode();
                  if (e.key === "Escape") setPhoneInput("");
                }}
              />
              <Button onClick={handleSendCode} disabled={sending}>
                {sending ? "Sending..." : "Send Code"}
              </Button>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              We&apos;ll send a 6-digit verification code via SMS.
            </p>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <button
            onClick={() => {
              setPhoneInput("");
              setError(null);
            }}
            className="text-[13px] font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Verification pending: code input */}
      {state === "verify_pending" && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Enter verification code sent to {formatPhoneDisplay(pendingPhone)}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="000000"
                maxLength={6}
                className="w-32 font-mono text-[14px] text-center tracking-widest bg-white border border-border rounded-brand-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerify();
                }}
              />
              <Button onClick={handleVerify} disabled={verifying}>
                {verifying ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSending(true);
                fetch("/api/sms/verify/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phoneNumber: pendingPhone }),
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.error) setError(data.error);
                  })
                  .catch(() => setError("Failed to resend code."))
                  .finally(() => setSending(false));
              }}
              disabled={sending}
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {sending ? "Resending..." : "Resend code"}
            </button>
            <button
              onClick={() => {
                setState("not_registered");
                setVerifyCode("");
                setError(null);
              }}
              className="text-[13px] font-medium text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Verified: show phone + Docket number */}
      {state === "verified" && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Your registered phone number
            </label>
            <input
              type="text"
              readOnly
              value={formatPhoneDisplay(phoneNumber)}
              className="font-mono text-[14px] bg-gray-50 border border-border rounded-brand-md px-3 py-2 text-text w-full"
            />
          </div>

          {docketNumber && (
            <div>
              <label className="block text-[13px] font-medium text-muted mb-1.5">
                Text invoices to this number
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={formatDocketNumber(docketNumber)}
                  className="flex-1 font-mono text-[14px] bg-gray-50 border border-border rounded-brand-md px-3 py-2 text-text select-all"
                />
                <button
                  onClick={handleCopyDocketNumber}
                  className="px-3 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-brand-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Test MMS link */}
          <a
            href={`sms:${docketNumber}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2.87 2.298a.75.75 0 00-1.24.845L5.22 8 1.63 12.857a.75.75 0 001.24.845L7.25 8.5h5a.75.75 0 100-1.5h-5L2.87 2.298z" />
            </svg>
            Send a test MMS
          </a>

          <p className="text-[12px] text-muted">
            Take a photo of an invoice or receipt and text it to the number above. We&apos;ll extract the data automatically.
          </p>

          {/* Remove phone */}
          <div className="pt-2 border-t border-border">
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="text-[13px] font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                Remove Phone Number
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[13px] text-muted">
                  SMS ingestion will be disabled.
                </p>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="px-3 py-1.5 text-[13px] font-medium bg-red-600 text-white rounded-brand-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {removing ? "Removing..." : "Confirm"}
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
