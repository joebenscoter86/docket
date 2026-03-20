"use client";

import { useState, useEffect } from "react";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_ACCOUNT_TYPE } from "@/lib/types/invoice";
import type { PaymentAccount } from "@/lib/accounting";

interface PaymentAccountSelectProps {
  outputType: OutputType;
  selectedAccountId: string | null;
  selectedAccountName: string | null;
  onSelect: (accountId: string, accountName: string) => void;
  disabled: boolean;
}

export default function PaymentAccountSelect({
  outputType,
  selectedAccountId,
  selectedAccountName,
  onSelect,
  disabled,
}: PaymentAccountSelectProps) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accountType = OUTPUT_TYPE_TO_ACCOUNT_TYPE[outputType as Exclude<OutputType, "bill">];
  const accountTypeLabel = accountType === "CreditCard" ? "credit card" : "bank";

  useEffect(() => {
    if (outputType === "bill") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/accounting/payment-accounts?type=${accountType}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error("Failed to fetch accounts");
        const body = await res.json();
        setAccounts(body.data?.accounts ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [outputType, accountType]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading {accountTypeLabel} accounts...
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-error">
        Failed to load {accountTypeLabel} accounts. Please try again.
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-warning">
        No {accountTypeLabel} accounts found. Add one in your accounting software first.
      </p>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1">
        Payment Account
      </label>
      <select
        value={selectedAccountId ?? ""}
        onChange={(e) => {
          const account = accounts.find((a) => a.id === e.target.value);
          if (account) {
            onSelect(account.id, account.name);
          }
        }}
        disabled={disabled}
        className={`w-full md:w-64 border rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary ${
          disabled ? "bg-gray-100 cursor-not-allowed border-border" : "border-border"
        }`}
      >
        <option value="">Select an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      {selectedAccountName && (
        <p className="mt-1 text-xs text-muted">
          Selected: {selectedAccountName}
        </p>
      )}
    </div>
  );
}
