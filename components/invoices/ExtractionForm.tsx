"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import {
  formReducer,
  initFormState,
  validateField,
  FORM_FIELDS,
  type FormField,
} from "./extraction-form-reducer";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils/currency";
import type { ExtractedDataRow } from "@/lib/types/invoice";

interface ExtractionFormProps {
  extractedData: ExtractedDataRow;
  invoiceId: string;
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

export default function ExtractionForm({
  extractedData,
  invoiceId,
}: ExtractionFormProps) {
  const [state, dispatch] = useReducer(
    formReducer,
    extractedData as unknown as Record<string, string | number | null>,
    initFormState
  );

  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    async (field: string) => {
      setFocusedField(null);
      const value = state.values[field];

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

  function renderField(field: FormField) {
    const config = FIELD_CONFIG[field];
    const value = state.values[field];
    const status = state.fieldStatus[field];
    const fieldError = state.fieldErrors[field];
    const changed = isChanged(field);
    const isFocused = focusedField === field;

    const wrapperClass = `relative ${changed ? "border-l-2 border-blue-500 pl-3" : "pl-0"}`;

    const inputBase =
      "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
    const inputClass = `${inputBase} ${
      fieldError ? "border-red-500" : "border-gray-200"
    }`;

    return (
      <div key={field} className={wrapperClass}>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          {config.label}
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
              // Parse raw string to number on blur before saving
              const parsed = parseCurrencyInput(String(value ?? ""));
              if (parsed !== null) {
                dispatch({ type: "SET_VALUE", field, value: parsed });
              }
              handleBlur(field);
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
      {/* Section 1: Invoice Details */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Invoice Details
        </h3>
        <div className="space-y-4">
          {renderField("vendor_name")}
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

      {/* Section 2: Amounts */}
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
