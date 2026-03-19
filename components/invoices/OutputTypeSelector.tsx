"use client";

import { useState, useCallback } from "react";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_HELPER_TEXT } from "@/lib/types/invoice";
import PaymentAccountSelect from "./PaymentAccountSelect";

interface OutputTypeSelectorProps {
  invoiceId: string;
  initialOutputType: OutputType;
  initialPaymentAccountId: string | null;
  initialPaymentAccountName: string | null;
  orgDefaultPaymentAccountId: string | null;
  orgDefaultPaymentAccountName: string | null;
  disabled: boolean;
  qboConnected: boolean;
  onOutputTypeChange: (outputType: OutputType) => void;
  onPaymentAccountChange: (accountId: string | null, accountName: string | null) => void;
}

const OUTPUT_TYPE_OPTIONS: OutputType[] = ["bill", "check", "cash", "credit_card"];

export default function OutputTypeSelector({
  invoiceId,
  initialOutputType,
  initialPaymentAccountId,
  initialPaymentAccountName,
  orgDefaultPaymentAccountId,
  orgDefaultPaymentAccountName,
  disabled,
  qboConnected,
  onOutputTypeChange,
  onPaymentAccountChange,
}: OutputTypeSelectorProps) {
  const [outputType, setOutputType] = useState<OutputType>(initialOutputType);
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(initialPaymentAccountId);
  const [paymentAccountName, setPaymentAccountName] = useState<string | null>(initialPaymentAccountName);
  const [saving, setSaving] = useState(false);

  const isBill = outputType === "bill";

  const handleOutputTypeChange = useCallback(
    async (newType: OutputType) => {
      if (newType === outputType || disabled) return;

      setSaving(true);
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ output_type: newType }),
        });

        if (!res.ok) return;

        setOutputType(newType);
        // Clear payment account when type changes (prevents stale account mismatch)
        setPaymentAccountId(null);
        setPaymentAccountName(null);
        onOutputTypeChange(newType);
        onPaymentAccountChange(null, null);

        // If non-bill and org has a default for this type, pre-select it
        if (newType !== "bill" && orgDefaultPaymentAccountId) {
          handlePaymentAccountSelect(orgDefaultPaymentAccountId, orgDefaultPaymentAccountName ?? "");
        }
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlePaymentAccountSelect is stable (only depends on invoiceId, onPaymentAccountChange)
    [outputType, disabled, invoiceId, onOutputTypeChange, onPaymentAccountChange, orgDefaultPaymentAccountId, orgDefaultPaymentAccountName]
  );

  const handlePaymentAccountSelect = useCallback(
    async (accountId: string, accountName: string) => {
      try {
        // Save to invoice
        const res = await fetch(`/api/invoices/${invoiceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_account_id: accountId,
            payment_account_name: accountName,
          }),
        });

        if (!res.ok) return;

        setPaymentAccountId(accountId);
        setPaymentAccountName(accountName);
        onPaymentAccountChange(accountId, accountName);

        // Save as org default
        await fetch("/api/settings/organization", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            default_payment_account_id: accountId,
            default_payment_account_name: accountName,
          }),
        });
      } catch {
        // Silent failure for org default save — not critical
      }
    },
    [invoiceId, onPaymentAccountChange]
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-text mb-1">
          Output Type
        </label>
        <select
          value={outputType}
          onChange={(e) => handleOutputTypeChange(e.target.value as OutputType)}
          disabled={disabled || saving}
          className={`w-full md:w-64 border rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary ${
            disabled ? "bg-gray-100 cursor-not-allowed border-border" : "border-border"
          }`}
        >
          {OUTPUT_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {OUTPUT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {/* Helper text for non-bill types */}
      {!isBill && (
        <p className="text-xs text-muted">
          {OUTPUT_TYPE_HELPER_TEXT[outputType as Exclude<OutputType, "bill">]}
        </p>
      )}

      {/* Payment account selector for non-bill types */}
      {!isBill && qboConnected && (
        <PaymentAccountSelect
          outputType={outputType}
          selectedAccountId={paymentAccountId}
          selectedAccountName={paymentAccountName}
          onSelect={handlePaymentAccountSelect}
          disabled={disabled}
        />
      )}

      {/* No QBO connection warning for non-bill types */}
      {!isBill && !qboConnected && (
        <p className="text-xs text-warning">
          Connect QuickBooks in Settings to use this option.
        </p>
      )}
    </div>
  );
}
