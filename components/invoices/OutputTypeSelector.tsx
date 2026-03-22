"use client";

import { useState, useCallback } from "react";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_HELPER_TEXT } from "@/lib/types/invoice";
import PaymentAccountSelect from "./PaymentAccountSelect";
import UpgradePrompt from "@/components/billing/UpgradePrompt";

interface OutputTypeSelectorProps {
  invoiceId: string;
  initialOutputType: OutputType;
  initialPaymentAccountId: string | null;
  initialPaymentAccountName: string | null;
  orgDefaultPaymentAccountId: string | null;
  orgDefaultPaymentAccountName: string | null;
  disabled: boolean;
  accountingConnected: boolean;
  billToCheckAllowed?: boolean;
  onOutputTypeChange: (outputType: OutputType) => void;
  onPaymentAccountChange: (accountId: string | null, accountName: string | null) => void;
}

const OUTPUT_TYPE_OPTIONS: { type: OutputType; icon: string }[] = [
  { type: "bill", icon: "📄" },
  { type: "check", icon: "✍️" },
  { type: "cash", icon: "💵" },
  { type: "credit_card", icon: "💳" },
];

export default function OutputTypeSelector({
  invoiceId,
  initialOutputType,
  initialPaymentAccountId,
  initialPaymentAccountName,
  orgDefaultPaymentAccountId,
  orgDefaultPaymentAccountName,
  disabled,
  accountingConnected,
  billToCheckAllowed = true,
  onOutputTypeChange,
  onPaymentAccountChange,
}: OutputTypeSelectorProps) {
  const [outputType, setOutputType] = useState<OutputType>(initialOutputType);
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(initialPaymentAccountId);
  const [paymentAccountName, setPaymentAccountName] = useState<string | null>(initialPaymentAccountName);
  const [saving, setSaving] = useState(false);

  const isBill = outputType === "bill";

  const handlePaymentAccountSelect = useCallback(
    async (accountId: string, accountName: string) => {
      try {
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
    [outputType, disabled, invoiceId, onOutputTypeChange, onPaymentAccountChange, orgDefaultPaymentAccountId, orgDefaultPaymentAccountName, handlePaymentAccountSelect]
  );

  return (
    <div className="space-y-3">
      {/* Pill buttons */}
      <div className="flex flex-wrap gap-2">
        {OUTPUT_TYPE_OPTIONS.filter(({ type }) => billToCheckAllowed || type === "bill").map(({ type, icon }) => {
          const isSelected = outputType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleOutputTypeChange(type)}
              disabled={disabled || saving}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium
                transition-all duration-150
                ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
                ${isSelected
                  ? "bg-primary text-white shadow-sm ring-2 ring-primary/20"
                  : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                }
              `}
            >
              <span className="text-base leading-none">{icon}</span>
              {OUTPUT_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      {!billToCheckAllowed && (
        <UpgradePrompt
          featureName="Check, cash, and credit card output types"
          requiredTier="pro"
        />
      )}

      {/* Helper text for non-bill types */}
      {!isBill && (
        <p className="text-xs text-muted">
          {OUTPUT_TYPE_HELPER_TEXT[outputType as Exclude<OutputType, "bill">]}
        </p>
      )}

      {/* Payment account selector for non-bill types */}
      {!isBill && accountingConnected && (
        <PaymentAccountSelect
          outputType={outputType}
          selectedAccountId={paymentAccountId}
          selectedAccountName={paymentAccountName}
          onSelect={handlePaymentAccountSelect}
          disabled={disabled}
        />
      )}

      {/* No accounting connection warning for non-bill types */}
      {!isBill && !accountingConnected && (
        <p className="text-xs text-warning">
          Connect your accounting software in Settings to use this option.
        </p>
      )}
    </div>
  );
}
