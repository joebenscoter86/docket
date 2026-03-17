"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import {
  formReducer,
  initFormState,
  validateField,
  type FormField,
} from "./extraction-form-reducer";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils/currency";
import type { ExtractedDataRow } from "@/lib/types/invoice";
import type { InvoiceStatus } from "@/lib/types/invoice";
import LineItemEditor from "./LineItemEditor";
import ApproveBar from "./ApproveBar";
import SyncBar from "./SyncBar";
import SyncStatusPanel from "./SyncStatusPanel";
import { useQboOptions } from "./hooks/useQboOptions";
import VendorSelect from "./VendorSelect";

interface ExtractionFormProps {
  extractedData: ExtractedDataRow;
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  errorMessage?: string | null;
}

const FIELD_CONFIG: Record<
  FormField,
  { label: string; type: "text" | "textarea" | "date" | "currency" | "select" }
> = {
  vendor_name: { label: "Vendor Name", type: "text" },
  vendor_address: { label: "Vendor Address", type: "textarea" },
  invoice_number: { label: "Invoice Number", type: "text" },
  invoice_date: { label: "Invoice Date", type: "date" },
  due_date: { label: "Due Date", type: "date" },
  payment_terms: { label: "Payment Terms", type: "text" },
  currency: { label: "Currency", type: "select" },
  subtotal: { label: "Subtotal", type: "currency" },
  tax_amount: { label: "Tax Amount", type: "currency" },
  total_amount: { label: "Total Amount", type: "currency" },
};

const CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "AUD"];

const CONFIDENCE_BORDER: Record<"high" | "medium" | "low", string> = {
  high: "border-l-2 border-green-500 pl-3",
  medium: "border-l-2 border-amber-500 pl-3",
  low: "border-l-2 border-red-500 pl-3",
};

export default function ExtractionForm({
  extractedData,
  invoiceId,
  invoiceStatus,
  errorMessage: initialErrorMessage,
}: ExtractionFormProps) {
  const [state, dispatch] = useReducer(
    formReducer,
    extractedData as unknown as Record<string, string | number | null>,
    initFormState
  );

  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState(0);
  const [currentStatus, setCurrentStatus] = useState(invoiceStatus);
  const confidenceScore = extractedData.confidence_score;

  const qboOptions = useQboOptions();
  const [vendorRef, setVendorRef] = useState<string | null>(
    extractedData.vendor_ref ?? null
  );

  const handleVendorSelect = useCallback(
    async (vendorRefValue: string | null): Promise<boolean> => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/extracted-data`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "vendor_ref", value: vendorRefValue }),
        });
        if (!res.ok) return false;
        setVendorRef(vendorRefValue);
        return true;
      } catch {
        return false;
      }
    },
    [invoiceId]
  );

  const handleSyncComplete = useCallback(() => {
    setSyncKey((k) => k + 1);
    setCurrentStatus("synced");
  }, []);

  const saveField = useCallback(
    async (field: string, value: string | number | null) => {
      dispatch({ type: "SET_FIELD_STATUS", field, status: "saving" });

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/extracted-data`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });

        if (!res.ok) {
          dispatch({ type: "SET_FIELD_STATUS", field, status: "error" });
          return false;
        }

        dispatch({ type: "SET_FIELD_STATUS", field, status: "saved" });

        // Clear "saved" indicator after 2s
        if (savedTimers.current[field]) clearTimeout(savedTimers.current[field]);
        savedTimers.current[field] = setTimeout(() => {
          dispatch({ type: "SET_FIELD_STATUS", field, status: "idle" });
        }, 2000);

        return true;
      } catch {
        dispatch({ type: "SET_FIELD_STATUS", field, status: "error" });
        return false;
      }
    },
    [invoiceId]
  );

  const handleBlur = useCallback(
    async (field: string, valueOverride?: string | number | null) => {
      setFocusedField(null);
      const value = valueOverride !== undefined ? valueOverride : state.values[field];

      // Validate
      const fieldError = validateField(field, value);
      dispatch({ type: "SET_FIELD_ERROR", field, error: fieldError });
      if (fieldError) return;

      // Skip if unchanged from last saved value
      const lastSaved = state.lastSavedValues[field];
      if (String(value ?? "") === String(lastSaved ?? "")) return;

      // Capture current subtotal/tax before async save (avoid stale closure)
      const currentSubtotal = state.values.subtotal;
      const currentTax = state.values.tax_amount;

      const saved = await saveField(field, value);
      if (saved) {
        dispatch({ type: "MARK_SAVED", field, value });
      }

      // Auto-calculate total when subtotal or tax changes
      if (saved && (field === "subtotal" || field === "tax_amount")) {
        const subtotal =
          field === "subtotal"
            ? typeof value === "number"
              ? value
              : null
            : typeof currentSubtotal === "number"
              ? currentSubtotal
              : null;
        const tax =
          field === "tax_amount"
            ? typeof value === "number"
              ? value
              : null
            : typeof currentTax === "number"
              ? currentTax
              : null;

        if (subtotal !== null && tax !== null) {
          const newTotal = Math.round((subtotal + tax) * 100) / 100;
          dispatch({ type: "SET_VALUE", field: "total_amount", value: newTotal });
          const totalSaved = await saveField("total_amount", newTotal);
          if (totalSaved) {
            dispatch({
              type: "MARK_SAVED",
              field: "total_amount",
              value: newTotal,
            });
          }
        }
      }
    },
    [state.values, state.lastSavedValues, saveField]
  );

  const handleChange = useCallback((field: string, rawValue: string) => {
    // Always store raw string while typing. Currency fields get parsed on blur.
    dispatch({
      type: "SET_VALUE",
      field,
      value: rawValue === "" ? null : rawValue,
    });
  }, []);

  const handleSubtotalChange = useCallback(
    async (newSubtotal: number) => {
      const rounded = Math.round(newSubtotal * 100) / 100;
      dispatch({ type: "SET_VALUE", field: "subtotal", value: rounded });
      const saved = await saveField("subtotal", rounded);
      if (saved) {
        dispatch({ type: "MARK_SAVED", field: "subtotal", value: rounded });

        // Cascade to total = subtotal + tax
        const tax = state.values.tax_amount;
        if (typeof tax === "number") {
          const newTotal = Math.round((rounded + tax) * 100) / 100;
          dispatch({ type: "SET_VALUE", field: "total_amount", value: newTotal });
          const totalSaved = await saveField("total_amount", newTotal);
          if (totalSaved) {
            dispatch({ type: "MARK_SAVED", field: "total_amount", value: newTotal });
          }
        }
      }
    },
    [saveField, state.values.tax_amount]
  );

  const isChanged = (field: string) =>
    String(state.values[field] ?? "") !==
    String(state.originalValues[field] ?? "");

  const totalMismatch = (() => {
    const s = state.values.subtotal;
    const t = state.values.tax_amount;
    const total = state.values.total_amount;
    if (
      typeof s === "number" &&
      typeof t === "number" &&
      typeof total === "number"
    ) {
      return Math.abs(s + t - total) > 0.01;
    }
    return false;
  })();

  const currency = (state.values.currency as string) ?? "USD";

  // Compute sync blockers for SyncBar
  const syncBlockers: string[] = [];
  if (!vendorRef) syncBlockers.push("Select a QuickBooks vendor");
  const lineItemsMissingAccount = (extractedData.extracted_line_items ?? []).filter(
    (li) => !li.gl_account_id
  );
  if (lineItemsMissingAccount.length > 0) {
    syncBlockers.push(`${lineItemsMissingAccount.length} line item(s) need a GL account`);
  }

  function renderField(field: FormField) {
    const config = FIELD_CONFIG[field];
    const value = state.values[field];
    const status = state.fieldStatus[field];
    const fieldError = state.fieldErrors[field];
    const changed = isChanged(field);
    const isFocused = focusedField === field;

    const wrapperClass = `relative ${
      changed
        ? "border-l-2 border-blue-500 pl-3"
        : confidenceScore !== null
          ? CONFIDENCE_BORDER[confidenceScore]
          : "pl-0"
    }`;

    const inputBase =
      "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
    const inputClass = `${inputBase} ${
      fieldError ? "border-red-500" : "border-gray-200"
    }`;

    return (
      <div key={field} className={wrapperClass}>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          {config.label}
          {!changed && confidenceScore !== null && <ConfidenceIcon level={confidenceScore} />}
          <FieldStatusIcon status={status} />
        </label>

        {config.type === "textarea" ? (
          <textarea
            className={`${inputClass} min-h-[60px] resize-y`}
            value={value ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
            rows={2}
          />
        ) : config.type === "date" ? (
          <input
            type="date"
            className={inputClass}
            value={(value as string) ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          />
        ) : config.type === "select" ? (
          <select
            className={inputClass}
            value={(value as string) ?? "USD"}
            onChange={(e) => {
              handleChange(field, e.target.value);
              saveField(field, e.target.value);
            }}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : config.type === "currency" ? (
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={
              isFocused
                ? typeof value === "number"
                  ? String(value)
                  : (value ?? "")
                : typeof value === "number"
                  ? formatCurrency(value, currency)
                  : (value ?? "")
            }
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => {
              // Parse raw string to number on blur, pass directly to handleBlur
              // to avoid stale closure (dispatch won't update state until next render)
              const parsed = parseCurrencyInput(String(value ?? ""));
              if (parsed !== null) {
                dispatch({ type: "SET_VALUE", field, value: parsed });
                handleBlur(field, parsed);
              } else {
                handleBlur(field);
              }
            }}
          />
        ) : (
          <input
            type="text"
            className={inputClass}
            value={(value as string) ?? ""}
            onChange={(e) => handleChange(field, e.target.value)}
            onFocus={() => setFocusedField(field)}
            onBlur={() => handleBlur(field)}
          />
        )}

        {fieldError && (
          <p className="mt-1 text-xs text-red-600">{fieldError}</p>
        )}

        {field === "total_amount" && totalMismatch && (
          <p className="mt-1 text-xs text-amber-600">
            Total doesn&apos;t match subtotal + tax
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Low-confidence banner */}
      {confidenceScore === "low" && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
          <svg
            className="h-5 w-5 text-amber-500 shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-amber-800">
            Some fields may need extra attention. Please review carefully.
          </p>
        </div>
      )}

      {/* Section 1: Invoice Details */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Invoice Details
        </h3>
        <div className="space-y-4">
          {renderField("vendor_name")}
          <VendorSelect
            vendors={qboOptions.vendors}
            loading={qboOptions.loading}
            connected={qboOptions.connected}
            error={qboOptions.error}
            currentVendorRef={vendorRef}
            vendorName={state.values.vendor_name as string | null}
            onSelect={handleVendorSelect}
            disabled={currentStatus === "synced"}
          />
          {renderField("vendor_address")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("invoice_number")}
            {renderField("payment_terms")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("invoice_date")}
            {renderField("due_date")}
          </div>
          <div className="w-full md:w-1/2">{renderField("currency")}</div>
        </div>
      </div>

      <div className="border-t border-gray-200" />

      {/* Section 2: Line Items */}
      <LineItemEditor
        lineItems={extractedData.extracted_line_items ?? []}
        invoiceId={invoiceId}
        extractedDataId={extractedData.id}
        currency={currency}
        onSubtotalChange={handleSubtotalChange}
        accounts={qboOptions.accounts}
        accountsLoading={qboOptions.loading}
        qboConnected={qboOptions.connected}
        disabled={currentStatus === "synced"}
      />

      <div className="border-t border-gray-200" />

      {/* Section 3: Amounts */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Amounts
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("subtotal")}
            {renderField("tax_amount")}
          </div>
          {renderField("total_amount")}
        </div>
      </div>

      {/* Approve bar — only shown for pending_review invoices */}
      {invoiceStatus === "pending_review" && (
        <>
          <div className="border-t border-gray-200" />
          <ApproveBar
            invoiceId={invoiceId}
            vendorName={state.values.vendor_name}
            totalAmount={state.values.total_amount}
          />
        </>
      )}

      {/* Sync bar — shown for approved invoices */}
      {(currentStatus === "approved" || currentStatus === "synced") && (
        <>
          <div className="border-t border-gray-200" />
          <SyncBar
            invoiceId={invoiceId}
            invoiceStatus={currentStatus}
            isRetry={!!initialErrorMessage?.startsWith("Sync failed")}
            onSyncComplete={handleSyncComplete}
            syncBlockers={syncBlockers}
          />
        </>
      )}

      {/* Sync status panel — shows sync history for approved/synced invoices */}
      {(currentStatus === "approved" || currentStatus === "synced") && (
        <>
          <div className="border-t border-gray-200" />
          <SyncStatusPanel
            key={syncKey}
            invoiceId={invoiceId}
            invoiceStatus={currentStatus}
          />
        </>
      )}
    </div>
  );
}

function FieldStatusIcon({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "saving") {
    return (
      <svg
        className="h-3.5 w-3.5 animate-spin text-gray-400"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    );
  }

  if (status === "saved") {
    return (
      <svg
        className="h-3.5 w-3.5 text-green-500 transition-opacity duration-300"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        className="h-3.5 w-3.5 text-red-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}

function ConfidenceIcon({ level }: { level: "high" | "medium" | "low" }) {
  if (level === "high") {
    return (
      <svg
        className="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="High confidence"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (level === "medium") {
    return (
      <svg
        className="h-3.5 w-3.5 text-amber-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="Medium confidence"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  // low
  return (
    <svg
      className="h-3.5 w-3.5 text-red-500"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-label="Low confidence"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}
