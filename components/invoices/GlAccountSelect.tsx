"use client";

import { useState, useRef, useCallback } from "react";
import type { AccountOption } from "@/lib/types/qbo";

interface GlAccountSelectProps {
  accounts: AccountOption[];
  loading: boolean;
  connected: boolean;
  currentAccountId: string | null;
  onSelect: (accountId: string | null) => Promise<boolean>;
  disabled?: boolean;
}

const STATUS_BORDER: Record<string, string> = {
  idle: "border-b-2 border-transparent",
  saving: "border-b-2 border-primary/60",
  saved: "border-b-2 border-accent",
  error: "border-b-2 border-error",
};

export default function GlAccountSelect({
  accounts,
  loading,
  connected,
  currentAccountId,
  onSelect,
  disabled = false,
}: GlAccountSelectProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value || null;
      setSaveStatus("saving");

      const ok = await onSelect(val);

      setSaveStatus(ok ? "saved" : "error");

      if (ok) {
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
      }
    },
    [onSelect]
  );

  if (!connected && !loading) {
    return (
      <span className="text-xs text-muted" title="Connect QuickBooks to map accounts">
        —
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <svg className="h-3 w-3 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className={STATUS_BORDER[saveStatus]}>
      <select
        className="w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary bg-white"
        value={currentAccountId ?? ""}
        onChange={handleChange}
        disabled={disabled || accounts.length === 0}
        title={accounts.length === 0 ? "No expense accounts found in QuickBooks" : undefined}
      >
        <option value="">Select account...</option>
        {accounts.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
