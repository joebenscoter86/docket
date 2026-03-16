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

interface LineItemEditorProps {
  lineItems: ExtractedLineItemRow[];
  invoiceId: string;
  extractedDataId: string;
  currency: string;
  onSubtotalChange: (newSubtotal: number) => void;
}

const STATUS_BORDER: Record<string, string> = {
  idle: "border-b-2 border-transparent",
  saving: "border-b-2 border-blue-400",
  saved: "border-b-2 border-green-500",
  error: "border-b-2 border-red-500",
};

export default function LineItemEditor({
  lineItems,
  invoiceId,
  extractedDataId,
  currency,
  onSubtotalChange,
}: LineItemEditorProps) {
  const [state, dispatch] = useReducer(lineItemsReducer, lineItems, initLineItemsState);
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
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

      const value = valueOverride !== undefined ? valueOverride : item.values[field as keyof typeof item.values];

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

  const inputBase =
    "w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  // Empty state
  if (state.items.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Line Items
        </h3>
        <div className="text-center py-6">
          <p className="text-sm text-gray-400 mb-3">
            No line items were extracted. You can add them manually below.
          </p>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {adding ? "Adding..." : "+ Add line item"}
          </button>
          {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
        Line Items
      </h3>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-x-2 items-center mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
        <span className="text-xs font-medium text-gray-500 uppercase text-right">Qty</span>
        <span className="text-xs font-medium text-gray-500 uppercase text-right">Unit Price</span>
        <span className="text-xs font-medium text-gray-500 uppercase text-right">Amount</span>
        <span />
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {state.items.map((item) => (
          <div key={item.id}>
          <div
            className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-x-2 items-center"
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
                <p className="text-xs text-red-600 mt-0.5">{item.fieldErrors.description}</p>
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
                className={`${inputBase} text-right bg-gray-50`}
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
                className="text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Remove line item"
              >
                ×
              </button>
            </div>
          </div>

          {/* Confirmation bar — full width below the row */}
          {confirmRemoveId === item.id && (
            <div className="flex items-center justify-end gap-2 py-1.5 px-2 text-xs bg-red-50 rounded-md mt-0.5">
              <span className="text-gray-600">Remove last item?</span>
              <button
                onClick={() => handleRemove(item.id)}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="mt-3">
        <button
          onClick={handleAdd}
          disabled={adding}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          {adding ? "Adding..." : "+ Add line item"}
        </button>
        {addError && <p className="mt-1 text-xs text-red-600">{addError}</p>}
      </div>
    </div>
  );
}
