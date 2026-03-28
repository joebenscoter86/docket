"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import {
  lineItemsReducer,
  initLineItemsState,
  validateLineItemField,
  type LineItemState,
} from "./line-items-reducer";
import { formatCurrency, parseCurrencyInput } from "@/lib/utils/currency";
import type { ExtractedLineItemRow } from "@/lib/types/invoice";
import type { AccountOption, TrackingCategory, TrackingAssignment } from "@/lib/accounting";
import GlAccountSelect from "./GlAccountSelect";
import TrackingCategorySelect from "./TrackingCategorySelect";

interface LineItemEditorProps {
  lineItems: ExtractedLineItemRow[];
  invoiceId: string;
  extractedDataId: string;
  currency: string;
  onSubtotalChange: (newSubtotal: number) => void;
  onMissingGlCountChange?: (count: number) => void;
  accounts: AccountOption[];
  accountsLoading: boolean;
  accountingConnected: boolean;
  disabled?: boolean;
  trackingCategories: TrackingCategory[];
}

const STATUS_BORDER: Record<string, string> = {
  idle: "border-b-2 border-transparent",
  saving: "border-b-2 border-primary/60",
  saved: "border-b-2 border-accent",
  error: "border-b-2 border-error",
};

export default function LineItemEditor({
  lineItems,
  invoiceId,
  extractedDataId,
  currency,
  onSubtotalChange,
  onMissingGlCountChange,
  accounts,
  accountsLoading,
  accountingConnected,
  disabled = false,
  trackingCategories,
}: LineItemEditorProps) {
  const [state, dispatch] = useReducer(lineItemsReducer, lineItems, initLineItemsState);
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [expandedTracking, setExpandedTracking] = useState<Set<string>>(() => {
    // Auto-expand line items that already have tracking assigned
    const expanded = new Set<string>();
    for (const li of lineItems) {
      if (li.tracking && li.tracking.length > 0) {
        expanded.add(li.id);
      }
    }
    return expanded;
  });
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const descriptionRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const calculateSubtotal = useCallback(
    (items: LineItemState[]) => {
      const total = items.reduce((sum, item) => {
        const amt = item.values.amount;
        return sum + (typeof amt === "number" ? amt : 0);
      }, 0);
      return Math.round(total * 100) / 100;
    },
    []
  );

  const saveField = useCallback(
    async (itemId: string, field: string, value: string | number | null) => {
      dispatch({ type: "SET_ITEM_STATUS", itemId, field, status: "saving" });

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/line-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });

        if (!res.ok) {
          dispatch({ type: "SET_ITEM_STATUS", itemId, field, status: "error" });
          return false;
        }

        dispatch({ type: "SET_ITEM_STATUS", itemId, field, status: "saved" });

        const timerKey = `${itemId}.${field}`;
        if (savedTimers.current[timerKey]) clearTimeout(savedTimers.current[timerKey]);
        savedTimers.current[timerKey] = setTimeout(() => {
          dispatch({ type: "SET_ITEM_STATUS", itemId, field, status: "idle" });
        }, 2000);

        return true;
      } catch {
        dispatch({ type: "SET_ITEM_STATUS", itemId, field, status: "error" });
        return false;
      }
    },
    [invoiceId]
  );

  const handleBlur = useCallback(
    async (itemId: string, field: string, valueOverride?: string | number | null) => {
      setFocusedCell(null);
      const item = state.items.find((i) => i.id === itemId);
      if (!item) return;

      const value = valueOverride !== undefined ? valueOverride : (item.values[field as keyof typeof item.values] as string | number | null);

      // Validate
      const fieldError = validateLineItemField(field, value);
      dispatch({ type: "SET_ITEM_ERROR", itemId, field, error: fieldError });
      if (fieldError) return;

      // Skip if unchanged
      const lastSaved = item.lastSavedValues[field as keyof typeof item.lastSavedValues];
      if (String(value ?? "") === String(lastSaved ?? "")) return;

      const saved = await saveField(itemId, field, value);
      if (saved) {
        dispatch({ type: "MARK_ITEM_SAVED", itemId, field, value });
      }

      // Auto-calc amount when qty or unit_price changes
      if (saved && (field === "quantity" || field === "unit_price")) {
        const qty = field === "quantity"
          ? (typeof value === "number" ? value : null)
          : item.values.quantity;
        const price = field === "unit_price"
          ? (typeof value === "number" ? value : null)
          : item.values.unit_price;

        if (qty !== null && price !== null) {
          const newAmount = Math.round(qty * price * 100) / 100;
          dispatch({ type: "SET_ITEM_VALUE", itemId, field: "amount", value: newAmount });
          const amountSaved = await saveField(itemId, "amount", newAmount);
          if (amountSaved) {
            dispatch({ type: "MARK_ITEM_SAVED", itemId, field: "amount", value: newAmount });
          }
        }
      }

      // Recalculate subtotal after any amount-affecting save
      if (saved && (field === "amount" || field === "quantity" || field === "unit_price")) {
        const updatedItems = state.items.map((i) => {
          if (i.id !== itemId) return i;
          if (field === "amount") {
            return { ...i, values: { ...i.values, amount: value as number | null } };
          }
          if (field === "quantity" || field === "unit_price") {
            const q = field === "quantity" ? (value as number | null) : i.values.quantity;
            const p = field === "unit_price" ? (value as number | null) : i.values.unit_price;
            const amt = q !== null && p !== null ? Math.round(q * p * 100) / 100 : i.values.amount;
            return { ...i, values: { ...i.values, amount: amt } };
          }
          return i;
        });
        onSubtotalChange(calculateSubtotal(updatedItems));
      }
    },
    [state.items, saveField, onSubtotalChange, calculateSubtotal]
  );

  const handleChange = useCallback((itemId: string, field: string, rawValue: string) => {
    dispatch({
      type: "SET_ITEM_VALUE",
      itemId,
      field,
      value: rawValue === "" ? null : rawValue,
    });
  }, []);

  const handleAdd = useCallback(async () => {
    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted_data_id: extractedDataId }),
      });

      if (!res.ok) {
        setAddError("Failed to add line item. Try again.");
        return;
      }

      const { data } = await res.json();
      dispatch({
        type: "ADD_ITEM",
        item: { id: data.id, sortOrder: data.sort_order },
      });

      // New items have no GL account — increment missing count
      if (onMissingGlCountChange) {
        const currentMissing = state.items.filter((i) => !i.values.gl_account_id).length;
        onMissingGlCountChange(currentMissing + 1);
      }

      // Focus the new row's description input after render
      setTimeout(() => {
        descriptionRefs.current[data.id]?.focus();
      }, 50);
    } catch {
      setAddError("Failed to add line item. Try again.");
    } finally {
      setAdding(false);
    }
  }, [invoiceId, extractedDataId]);

  const handleRemove = useCallback(
    async (itemId: string) => {
      // Optimistic removal
      dispatch({ type: "REMOVE_ITEM", itemId });
      setConfirmRemoveId(null);

      // Recalculate subtotal
      const remaining = state.items.filter((i) => i.id !== itemId);
      onSubtotalChange(calculateSubtotal(remaining));

      // Update missing GL count after removal
      if (onMissingGlCountChange) {
        onMissingGlCountChange(remaining.filter((i) => !i.values.gl_account_id).length);
      }

      try {
        await fetch(`/api/invoices/${invoiceId}/line-items/${itemId}`, {
          method: "DELETE",
        });
      } catch {
        // Optimistic removal — failure is rare, page refresh fixes state
      }
    },
    [invoiceId, state.items, onSubtotalChange, calculateSubtotal]
  );

  const handleGlAccountSelect = useCallback(
    async (itemId: string, accountId: string | null): Promise<boolean> => {
      dispatch({ type: "SET_ITEM_VALUE", itemId, field: "gl_account_id", value: accountId });
      // Clear suggestion source so "Learned" / "AI" badge disappears on user override
      dispatch({ type: "SET_ITEM_VALUE", itemId, field: "gl_suggestion_source", value: null });
      const ok = await saveField(itemId, "gl_account_id", accountId);
      if (ok) {
        dispatch({ type: "MARK_ITEM_SAVED", itemId, field: "gl_account_id", value: accountId });
        // Notify parent of updated missing GL count so sync blockers stay in sync
        if (onMissingGlCountChange) {
          const missingCount = state.items.filter((item) => {
            const glVal = item.id === itemId ? accountId : item.values.gl_account_id;
            return !glVal;
          }).length;
          onMissingGlCountChange(missingCount);
        }
      }
      return ok;
    },
    [saveField, state.items, onMissingGlCountChange]
  );

  const pendingAiItems = state.items.filter(
    (i) => i.values.suggested_gl_account_id && !i.values.gl_account_id && i.values.gl_suggestion_source === "ai"
  );

  const handleAcceptAllAiSuggestions = useCallback(async () => {
    setAcceptingAll(true);
    const pending = state.items.filter(
      (i) => i.values.suggested_gl_account_id && !i.values.gl_account_id && i.values.gl_suggestion_source === "ai"
    );
    const results = await Promise.all(
      pending.map((item) => handleGlAccountSelect(item.id, item.values.suggested_gl_account_id as string))
    );
    // Fix stale-closure race: each concurrent handleGlAccountSelect computed
    // the missing count using the same pre-batch state.items snapshot, so only
    // its own item was subtracted. Recompute the true count after all saves.
    if (onMissingGlCountChange && pending.length > 0) {
      const acceptedIds = new Set(
        pending.filter((_, i) => results[i]).map((item) => item.id)
      );
      const correctedCount = state.items.filter((item) => {
        if (acceptedIds.has(item.id)) return false;
        return !item.values.gl_account_id;
      }).length;
      onMissingGlCountChange(correctedCount);
    }
    setAcceptingAll(false);
  }, [state.items, handleGlAccountSelect, onMissingGlCountChange]);

  const handleTrackingChange = useCallback(
    async (itemId: string, assignment: TrackingAssignment | null, categoryId: string) => {
      const item = state.items.find((i) => i.id === itemId);
      if (!item) return;

      const currentTracking = (item.values.tracking as TrackingAssignment[] | null) ?? [];

      let newTracking: TrackingAssignment[];
      if (assignment) {
        const filtered = currentTracking.filter((t) => t.categoryId !== categoryId);
        newTracking = [...filtered, assignment];
      } else {
        newTracking = currentTracking.filter((t) => t.categoryId !== categoryId);
      }

      const trackingValue = newTracking.length > 0 ? newTracking : null;

      dispatch({ type: "SET_ITEM_VALUE", itemId, field: "tracking", value: trackingValue as unknown as string | number | null });
      dispatch({ type: "SET_ITEM_STATUS", itemId, field: "tracking", status: "saving" });

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/line-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "tracking", value: trackingValue }),
        });

        if (!res.ok) {
          dispatch({ type: "SET_ITEM_STATUS", itemId, field: "tracking", status: "error" });
          return;
        }

        dispatch({ type: "SET_ITEM_STATUS", itemId, field: "tracking", status: "saved" });
        dispatch({ type: "MARK_ITEM_SAVED", itemId, field: "tracking", value: trackingValue as unknown as string | number | null });

        const timerKey = `${itemId}.tracking`;
        if (savedTimers.current[timerKey]) clearTimeout(savedTimers.current[timerKey]);
        savedTimers.current[timerKey] = setTimeout(() => {
          dispatch({ type: "SET_ITEM_STATUS", itemId, field: "tracking", status: "idle" });
        }, 2000);
      } catch {
        dispatch({ type: "SET_ITEM_STATUS", itemId, field: "tracking", status: "error" });
      }
    },
    [invoiceId, state.items]
  );

  const inputBase =
    "w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary";

  // Empty state
  if (state.items.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4">
          Line Items
        </h3>
        <div className="text-center py-6">
          <p className="text-sm text-muted mb-3">
            No line items were extracted. You can add them manually below.
          </p>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="text-sm text-primary hover:text-primary-hover disabled:opacity-50"
          >
            {adding ? "Adding..." : "+ Add line item"}
          </button>
          {addError && <p className="mt-2 text-xs text-error">{addError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Line Items
        </h3>
        {pendingAiItems.length >= 2 && (
          <button
            type="button"
            onClick={handleAcceptAllAiSuggestions}
            disabled={acceptingAll || disabled}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acceptingAll ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Accepting...
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Accept all AI suggestions ({pendingAiItems.length})
              </>
            )}
          </button>
        )}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_70px_100px_100px_140px_32px] gap-x-2 items-center mb-1">
        <span className="text-xs font-medium text-muted uppercase">Description</span>
        <span className="text-xs font-medium text-muted uppercase text-right">Qty</span>
        <span className="text-xs font-medium text-muted uppercase text-right">Unit Price</span>
        <span className="text-xs font-medium text-muted uppercase text-right">Amount</span>
        <span className="text-xs font-medium text-muted uppercase">GL Account</span>
        <span />
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {state.items.map((item) => {
          const hasTracking = (item.values.tracking as TrackingAssignment[] | null)?.length;
          const isTrackingExpanded = expandedTracking.has(item.id);
          return (
          <div key={item.id} className={isTrackingExpanded || hasTracking ? "bg-background/60 rounded-md px-2 py-1.5 -mx-2" : ""}>
          <div
            className="grid grid-cols-[1fr_70px_100px_100px_140px_32px] gap-x-2 items-center"
          >
            {/* Description */}
            <div className={STATUS_BORDER[item.fieldStatus.description ?? "idle"]}>
              <input
                ref={(el) => { descriptionRefs.current[item.id] = el; }}
                type="text"
                className={inputBase}
                placeholder="Description"
                value={(item.values.description as string) ?? ""}
                onChange={(e) => handleChange(item.id, "description", e.target.value)}
                onFocus={() => setFocusedCell(`${item.id}.description`)}
                onBlur={() => handleBlur(item.id, "description")}
              />
              {item.fieldErrors.description && (
                <p className="text-xs text-error mt-0.5">{item.fieldErrors.description}</p>
              )}
            </div>

            {/* Quantity */}
            <div className={STATUS_BORDER[item.fieldStatus.quantity ?? "idle"]}>
              <input
                type="text"
                inputMode="decimal"
                className={`${inputBase} text-right`}
                placeholder="0"
                value={
                  focusedCell === `${item.id}.quantity`
                    ? (item.values.quantity !== null ? String(item.values.quantity) : "")
                    : (item.values.quantity !== null ? String(item.values.quantity) : "")
                }
                onChange={(e) => handleChange(item.id, "quantity", e.target.value)}
                onFocus={() => setFocusedCell(`${item.id}.quantity`)}
                onBlur={() => {
                  const raw = item.values.quantity;
                  const parsed = typeof raw === "number" ? raw : (raw !== null ? Number(raw) : null);
                  if (parsed !== null && !isNaN(parsed)) {
                    dispatch({ type: "SET_ITEM_VALUE", itemId: item.id, field: "quantity", value: parsed });
                    handleBlur(item.id, "quantity", parsed);
                  } else {
                    handleBlur(item.id, "quantity");
                  }
                }}
              />
            </div>

            {/* Unit Price */}
            <div className={STATUS_BORDER[item.fieldStatus.unit_price ?? "idle"]}>
              <input
                type="text"
                inputMode="decimal"
                className={`${inputBase} text-right`}
                placeholder="$0.00"
                value={
                  focusedCell === `${item.id}.unit_price`
                    ? (typeof item.values.unit_price === "number"
                        ? String(item.values.unit_price)
                        : (item.values.unit_price ?? ""))
                    : (typeof item.values.unit_price === "number"
                        ? formatCurrency(item.values.unit_price, currency)
                        : (item.values.unit_price ?? ""))
                }
                onChange={(e) => handleChange(item.id, "unit_price", e.target.value)}
                onFocus={() => setFocusedCell(`${item.id}.unit_price`)}
                onBlur={() => {
                  const raw = String(item.values.unit_price ?? "");
                  const parsed = parseCurrencyInput(raw);
                  if (parsed !== null) {
                    dispatch({ type: "SET_ITEM_VALUE", itemId: item.id, field: "unit_price", value: parsed });
                    handleBlur(item.id, "unit_price", parsed);
                  } else {
                    handleBlur(item.id, "unit_price");
                  }
                }}
              />
            </div>

            {/* Amount (auto-calc, muted background) */}
            <div className={STATUS_BORDER[item.fieldStatus.amount ?? "idle"]}>
              <input
                type="text"
                inputMode="decimal"
                className={`${inputBase} text-right bg-background`}
                placeholder="$0.00"
                value={
                  focusedCell === `${item.id}.amount`
                    ? (typeof item.values.amount === "number"
                        ? String(item.values.amount)
                        : (item.values.amount ?? ""))
                    : (typeof item.values.amount === "number"
                        ? formatCurrency(item.values.amount, currency)
                        : (item.values.amount ?? ""))
                }
                onChange={(e) => handleChange(item.id, "amount", e.target.value)}
                onFocus={() => setFocusedCell(`${item.id}.amount`)}
                onBlur={() => {
                  const raw = String(item.values.amount ?? "");
                  const parsed = parseCurrencyInput(raw);
                  if (parsed !== null) {
                    dispatch({ type: "SET_ITEM_VALUE", itemId: item.id, field: "amount", value: parsed });
                    handleBlur(item.id, "amount", parsed);
                  } else {
                    handleBlur(item.id, "amount");
                  }
                }}
              />
            </div>

            {/* GL Account */}
            <GlAccountSelect
              accounts={accounts}
              loading={accountsLoading}
              connected={accountingConnected}
              currentAccountId={item.values.gl_account_id as string | null}
              onSelect={(accountId) => handleGlAccountSelect(item.id, accountId)}
              disabled={disabled}
              suggestedAccountId={item.values.suggested_gl_account_id}
              suggestionSource={item.values.gl_suggestion_source as "ai" | "history" | null}
            />

            {/* Remove button */}
            <div className="flex items-center justify-center">
              <button
                onClick={() => {
                  if (state.items.length === 1) {
                    setConfirmRemoveId(item.id);
                  } else {
                    handleRemove(item.id);
                  }
                }}
                className="text-muted hover:text-error transition-colors"
                aria-label="Remove line item"
              >
                ×
              </button>
            </div>
          </div>

          {/* Tracking categories sub-row */}
          {trackingCategories.length > 0 && !isTrackingExpanded && !hasTracking && (
            <button
              type="button"
              onClick={() => setExpandedTracking((prev) => new Set(prev).add(item.id))}
              disabled={disabled}
              className="text-xs text-muted hover:text-primary pl-2 pt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add tracking category
            </button>
          )}
          {trackingCategories.length > 0 && (isTrackingExpanded || !!hasTracking) && (
            <div className="flex items-center gap-4 pl-2 pt-1">
              {trackingCategories.map((cat) => {
                const currentTracking = (item.values.tracking as TrackingAssignment[] | null) ?? [];
                const assignment = currentTracking.find((t) => t.categoryId === cat.id) ?? null;
                return (
                  <TrackingCategorySelect
                    key={cat.id}
                    category={cat}
                    currentAssignment={assignment}
                    onSelect={(a) => handleTrackingChange(item.id, a, cat.id)}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          )}

          {/* Confirmation bar — full width below the row */}
          {confirmRemoveId === item.id && (
            <div className="flex items-center justify-end gap-2 py-1.5 px-2 text-xs bg-error/5 rounded-md mt-0.5">
              <span className="text-muted">Remove last item?</span>
              <button
                onClick={() => handleRemove(item.id)}
                className="text-error hover:text-error font-medium"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          )}
          </div>
        );
        })}
      </div>

      {/* Add button */}
      <div className="mt-3">
        <button
          onClick={handleAdd}
          disabled={adding}
          className="text-sm text-primary hover:text-primary-hover disabled:opacity-50"
        >
          {adding ? "Adding..." : "+ Add line item"}
        </button>
        {addError && <p className="mt-1 text-xs text-error">{addError}</p>}
      </div>
    </div>
  );
}
