"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_ACCOUNT_TYPE } from "@/lib/types/invoice";
import type { PaymentAccount } from "@/lib/accounting";

export interface SyncInvoiceItem {
  id: string;
  fileName: string;
  vendorName: string | null;
  totalAmount: number | null;
  outputType: OutputType;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
}

interface BatchSyncDialogProps {
  invoices: SyncInvoiceItem[];
  onConfirm: (
    invoiceConfigs: Array<{
      id: string;
      outputType: OutputType;
      paymentAccountId: string | null;
      paymentAccountName: string | null;
    }>
  ) => void;
  onCancel: () => void;
  isSyncing: boolean;
}

const OUTPUT_OPTIONS: Array<{ value: OutputType; label: string; shortLabel: string }> = [
  { value: "bill", label: "Bill", shortLabel: "Bill" },
  { value: "check", label: "Check", shortLabel: "Check" },
  { value: "cash", label: "Cash", shortLabel: "Cash" },
  { value: "credit_card", label: "Credit Card", shortLabel: "CC" },
];

export default function BatchSyncDialog({
  invoices,
  onConfirm,
  onCancel,
  isSyncing,
}: BatchSyncDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Per-invoice output type + payment account state
  const [configs, setConfigs] = useState<
    Record<string, { outputType: OutputType; paymentAccountId: string | null; paymentAccountName: string | null }>
  >(() => {
    const initial: Record<string, { outputType: OutputType; paymentAccountId: string | null; paymentAccountName: string | null }> = {};
    for (const inv of invoices) {
      initial[inv.id] = {
        outputType: inv.outputType,
        paymentAccountId: inv.paymentAccountId,
        paymentAccountName: inv.paymentAccountName,
      };
    }
    return initial;
  });

  // Payment accounts (fetched once, shared across all rows)
  const [bankAccounts, setBankAccounts] = useState<PaymentAccount[]>([]);
  const [ccAccounts, setCcAccounts] = useState<PaymentAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  // Fetch payment accounts on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchAccounts() {
      try {
        const [bankRes, ccRes] = await Promise.all([
          fetch("/api/accounting/payment-accounts?type=Bank"),
          fetch("/api/accounting/payment-accounts?type=CreditCard"),
        ]);

        if (cancelled) return;

        if (bankRes.ok) {
          const bankBody = await bankRes.json();
          setBankAccounts(bankBody.data ?? []);
        }
        if (ccRes.ok) {
          const ccBody = await ccRes.json();
          setCcAccounts(ccBody.data ?? []);
        }
      } catch {
        // Non-critical -- user can still sync as bill
      }

      if (!cancelled) setAccountsLoading(false);
    }

    fetchAccounts();
    return () => { cancelled = true; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSyncing) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isSyncing]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const setOutputType = useCallback((invoiceId: string, outputType: OutputType) => {
    setConfigs((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        outputType,
        // Clear payment account when switching types
        paymentAccountId: null,
        paymentAccountName: null,
      },
    }));
  }, []);

  const setPaymentAccount = useCallback((invoiceId: string, accountId: string, accountName: string) => {
    setConfigs((prev) => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        paymentAccountId: accountId,
        paymentAccountName: accountName,
      },
    }));
  }, []);

  // Apply a single output type to all invoices
  const setAllOutputType = useCallback((outputType: OutputType) => {
    setConfigs((prev) => {
      const next: typeof prev = {};
      for (const id of Object.keys(prev)) {
        next[id] = {
          ...prev[id],
          outputType,
          paymentAccountId: null,
          paymentAccountName: null,
        };
      }
      return next;
    });
  }, []);

  // Check if any non-bill invoice is missing a payment account
  const missingPaymentAccounts = invoices.filter((inv) => {
    const cfg = configs[inv.id];
    return cfg && cfg.outputType !== "bill" && !cfg.paymentAccountId;
  });

  const canConfirm = missingPaymentAccounts.length === 0 && !isSyncing;

  const handleConfirm = () => {
    const result = invoices.map((inv) => ({
      id: inv.id,
      outputType: configs[inv.id].outputType,
      paymentAccountId: configs[inv.id].paymentAccountId,
      paymentAccountName: configs[inv.id].paymentAccountName,
    }));
    onConfirm(result);
  };

  function getAccountsForType(outputType: OutputType): PaymentAccount[] {
    if (outputType === "bill") return [];
    const accountType = OUTPUT_TYPE_TO_ACCOUNT_TYPE[outputType];
    return accountType === "CreditCard" ? ccAccounts : bankAccounts;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSyncing) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-sync-title"
        tabIndex={-1}
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl outline-none"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 px-5 py-4">
          <h2
            id="batch-sync-title"
            className="text-base font-semibold text-gray-900"
          >
            Sync {invoices.length} Invoice{invoices.length !== 1 ? "s" : ""}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Choose the transaction type for each invoice.
          </p>
        </div>

        {/* Set all shortcut */}
        <div className="flex-shrink-0 border-b border-gray-100 px-5 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Set all to:</span>
            <div className="flex gap-1">
              {OUTPUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAllOutputType(opt.value)}
                  disabled={isSyncing}
                  className="rounded px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60"
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Invoice list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-3">
            {invoices.map((inv) => {
              const cfg = configs[inv.id];
              const needsPaymentAccount = cfg.outputType !== "bill";
              const accounts = getAccountsForType(cfg.outputType);

              return (
                <div
                  key={inv.id}
                  className="rounded-md border border-gray-200 px-3 py-2.5"
                >
                  {/* Invoice info */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {inv.vendorName ?? inv.fileName}
                      </p>
                      {inv.totalAmount !== null && (
                        <p className="text-xs text-gray-500">
                          ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Output type pills */}
                  <div className="mt-2 flex gap-1">
                    {OUTPUT_OPTIONS.map((opt) => {
                      const isSelected = cfg.outputType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setOutputType(inv.id, opt.value)}
                          disabled={isSyncing}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Payment account selector for non-bill types */}
                  {needsPaymentAccount && (
                    <div className="mt-2">
                      {accountsLoading ? (
                        <p className="text-xs text-gray-400">Loading accounts...</p>
                      ) : accounts.length === 0 ? (
                        <p className="text-xs text-amber-600">
                          No {cfg.outputType === "credit_card" ? "credit card" : "bank"} accounts found.
                        </p>
                      ) : (
                        <select
                          value={cfg.paymentAccountId ?? ""}
                          onChange={(e) => {
                            const acct = accounts.find((a) => a.id === e.target.value);
                            if (acct) setPaymentAccount(inv.id, acct.id, acct.name);
                          }}
                          disabled={isSyncing}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                        >
                          <option value="">
                            Select {cfg.outputType === "credit_card" ? "credit card" : "bank account"}...
                          </option>
                          {accounts.map((acct) => (
                            <option key={acct.id} value={acct.id}>
                              {acct.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 px-5 py-3">
          {missingPaymentAccounts.length > 0 && (
            <p className="mb-2 text-xs text-amber-600">
              {missingPaymentAccounts.length} invoice{missingPaymentAccounts.length !== 1 ? "s" : ""} need a payment account selected.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSyncing}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncing ? (
                <>
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing...
                </>
              ) : (
                `Sync ${invoices.length} to Accounting`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
