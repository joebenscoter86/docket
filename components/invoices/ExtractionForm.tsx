"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formReducer,
  initFormState,
  validateField,
  type FormField,
} from "./extraction-form-reducer";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils/currency";
import type { ExtractedDataRow, OutputType } from "@/lib/types/invoice";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { OUTPUT_TYPE_LABELS } from "@/lib/types/invoice";
import LineItemEditor from "./LineItemEditor";
import ActionBar from "./ActionBar";
import SyncStatusPanel from "./SyncStatusPanel";
import OutputTypeSelector from "./OutputTypeSelector";
import { useAccountingOptions } from "./hooks/useAccountingOptions";
import VendorSelect from "./VendorSelect";
import type { AccountingProviderType } from "@/lib/accounting/types";
import { getProviderLabel } from "@/lib/accounting/links";

interface ExtractionFormProps {
  extractedData: ExtractedDataRow;
  invoiceId: string;
  invoiceStatus: InvoiceStatus;
  errorMessage?: string | null;
  outputType: OutputType;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  orgDefaults: {
    defaultOutputType: OutputType;
    defaultPaymentAccountId: string | null;
    defaultPaymentAccountName: string | null;
  };
  batchId?: string | null;
  batchManifest?: { id: string; status: string }[];
  accountingProvider: AccountingProviderType | null;
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
  high: "border-l-2 border-accent pl-3",
  medium: "border-l-2 border-warning pl-3",
  low: "border-l-2 border-error pl-3",
};

export default function ExtractionForm({
  extractedData,
  invoiceId,
  invoiceStatus,
  errorMessage: initialErrorMessage,
  outputType: initialOutputType,
  paymentAccountId: initialPaymentAccountId,
  paymentAccountName: initialPaymentAccountName,
  orgDefaults,
  batchId,
  batchManifest,
  accountingProvider,
}: ExtractionFormProps) {
  const router = useRouter();
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

  const accountingOptions = useAccountingOptions();
  const [vendorRef, setVendorRef] = useState<string | null>(
    extractedData.vendor_ref ?? null
  );

  // Track how many line items are missing a GL account (initialized from server data, updated via callback)
  const [lineItemsMissingGl, setLineItemsMissingGl] = useState(() =>
    (extractedData.extracted_line_items ?? []).filter((li) => !li.gl_account_id).length
  );

  // Output type state
  const [currentOutputType, setCurrentOutputType] = useState<OutputType>(initialOutputType);
  const [currentPaymentAccountId, setCurrentPaymentAccountId] = useState<string | null>(initialPaymentAccountId);
  const [currentPaymentAccountName, setCurrentPaymentAccountName] = useState<string | null>(initialPaymentAccountName);

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

  const handleStatusChange = useCallback((newStatus: InvoiceStatus) => {
    setCurrentStatus(newStatus);
    if (newStatus === "synced") {
      setSyncKey((k) => k + 1);
    }
    // After approve, check if this was the last unreviewed invoice in the batch
    if (newStatus === "approved" && batchId && batchManifest) {
      const remaining = batchManifest.filter(
        (m) =>
          m.id !== invoiceId &&
          ["pending_review", "uploaded", "extracting", "error"].includes(m.status)
      );
      if (remaining.length === 0) {
        router.push(`/invoices?batch_id=${batchId}&toast=all-reviewed`);
      }
    }
  }, [batchId, batchManifest, invoiceId, router]);

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

  // Compute sync blockers for ActionBar
  const providerLabel = accountingProvider ? getProviderLabel(accountingProvider) : "your accounting software";
  const syncBlockers: string[] = [];
  if (!accountingOptions.connected) {
    syncBlockers.push(`Connect ${providerLabel} in Settings`);
  }
  if (!vendorRef) syncBlockers.push(`Select a ${providerLabel} vendor`);
  if (lineItemsMissingGl > 0) {
    syncBlockers.push(`${lineItemsMissingGl} line item(s) need a GL account`);
  }
  if (currentOutputType !== "bill" && !currentPaymentAccountId) {
    syncBlockers.push(`Select a payment account for ${OUTPUT_TYPE_LABELS[currentOutputType]}`);
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
        ? "border-l-2 border-primary pl-3"
        : confidenceScore !== null
          ? CONFIDENCE_BORDER[confidenceScore]
          : "pl-0"
    }`;

    const inputBase =
      "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary";
    const inputClass = `${inputBase} ${
      fieldError ? "border-error" : "border-border"
    }`;

    return (
      <div key={field} className={wrapperClass}>
        <label className="flex items-center gap-2 text-sm font-medium text-text mb-1">
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
          <p className="mt-1 text-xs text-error">{fieldError}</p>
        )}

        {field === "total_amount" && totalMismatch && (
          <p className="mt-1 text-xs text-warning">
            Total doesn&apos;t match subtotal + tax
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Output type selector — top of form so users see all options immediately */}
      <OutputTypeSelector
        invoiceId={invoiceId}
        initialOutputType={currentOutputType}
        initialPaymentAccountId={currentPaymentAccountId}
        initialPaymentAccountName={currentPaymentAccountName}
        orgDefaultPaymentAccountId={orgDefaults.defaultPaymentAccountId}
        orgDefaultPaymentAccountName={orgDefaults.defaultPaymentAccountName}
        disabled={currentStatus === "synced"}
        accountingConnected={accountingOptions.connected}
        onOutputTypeChange={setCurrentOutputType}
        onPaymentAccountChange={(id, name) => {
          setCurrentPaymentAccountId(id);
          setCurrentPaymentAccountName(name);
        }}
      />

      {/* Accounting disconnection warning */}
      {!accountingOptions.loading && !accountingOptions.connected && (
        <div className="flex items-start gap-2 bg-error/5 border border-error/20 rounded-md p-3">
          <svg
            className="h-5 w-5 text-error shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-sm">
            <p className="text-error font-medium">
              {accountingProvider
                ? `${getProviderLabel(accountingProvider)} disconnected`
                : "No accounting provider connected"}
            </p>
            <p className="text-muted mt-0.5">
              {accountingOptions.error ?? "Reconnect in Settings to sync invoices."}
              {" "}
              <a
                href="/settings"
                className="text-primary hover:text-primary-hover underline"
              >
                Go to Settings
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Low-confidence banner */}
      {confidenceScore === "low" && (
        <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-3">
          <svg
            className="h-5 w-5 text-warning shrink-0 mt-0.5"
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
          <p className="text-sm text-warning">
            Some fields may need extra attention. Please review carefully.
          </p>
        </div>
      )}

      {/* Section 1: Invoice Details */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4">
          Invoice Details
        </h3>
        <div className="space-y-4">
          {renderField("vendor_name")}
          <VendorSelect
            vendors={accountingOptions.vendors}
            loading={accountingOptions.loading}
            connected={accountingOptions.connected}
            error={accountingOptions.error}
            currentVendorRef={vendorRef}
            vendorName={state.values.vendor_name as string | null}
            onSelect={handleVendorSelect}
            disabled={currentStatus === "synced"}
            vendorAddress={state.values.vendor_address as string | null}
            onVendorCreated={accountingOptions.addVendor}
            providerLabel={providerLabel}
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

      <div className="border-t border-border" />

      {/* Section 2: Line Items */}
      <LineItemEditor
        lineItems={extractedData.extracted_line_items ?? []}
        invoiceId={invoiceId}
        extractedDataId={extractedData.id}
        currency={currency}
        onSubtotalChange={handleSubtotalChange}
        onMissingGlCountChange={setLineItemsMissingGl}
        accounts={accountingOptions.accounts}
        accountsLoading={accountingOptions.loading}
        accountingConnected={accountingOptions.connected}
        disabled={currentStatus === "synced"}
      />

      <div className="border-t border-border" />

      {/* Section 3: Amounts */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4">
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

      {/* Action bar — shown for pending_review, approved, and synced invoices */}
      {(currentStatus === "pending_review" || currentStatus === "approved" || currentStatus === "synced") && (
        <>
          <div className="border-t border-border" />
          <ActionBar
            invoiceId={invoiceId}
            currentStatus={currentStatus}
            vendorName={state.values.vendor_name}
            totalAmount={state.values.total_amount}
            syncBlockers={syncBlockers}
            isRetry={!!initialErrorMessage?.startsWith("Sync failed")}
            outputType={currentOutputType}
            provider={accountingProvider}
            onStatusChange={handleStatusChange}
          />
        </>
      )}

      {/* Sync status panel — shows sync history for approved/synced invoices */}
      {(currentStatus === "approved" || currentStatus === "synced") && (
        <>
          <div className="border-t border-border" />
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
        className="h-3.5 w-3.5 animate-spin text-muted"
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
        className="h-3.5 w-3.5 text-accent transition-opacity duration-300"
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
        className="h-3.5 w-3.5 text-error"
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
        className="h-3.5 w-3.5 text-accent"
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
        className="h-3.5 w-3.5 text-warning"
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
      className="h-3.5 w-3.5 text-error"
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
