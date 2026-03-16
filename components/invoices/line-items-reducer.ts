import type { ExtractedLineItemRow } from "@/lib/types/invoice";

// --- Types ---

export interface LineItemValues {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface LineItemState {
  id: string;
  sortOrder: number;
  values: LineItemValues;
  originalValues: LineItemValues;
  lastSavedValues: LineItemValues;
  fieldStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  fieldErrors: Record<string, string | null>;
  isNew: boolean;
}

export interface LineItemsState {
  items: LineItemState[];
}

const LINE_ITEM_FIELDS = ["description", "quantity", "unit_price", "amount"] as const;
export type LineItemField = (typeof LINE_ITEM_FIELDS)[number];

// --- Init ---

function extractValues(item: ExtractedLineItemRow): LineItemValues {
  return {
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    amount: item.amount,
  };
}

function makeFieldRecord<T>(value: T): Record<string, T> {
  const rec: Record<string, T> = {};
  for (const f of LINE_ITEM_FIELDS) rec[f] = value;
  return rec;
}

export function initLineItemsState(items: ExtractedLineItemRow[]): LineItemsState {
  return {
    items: items.map((item) => {
      const values = extractValues(item);
      return {
        id: item.id,
        sortOrder: item.sort_order,
        values,
        originalValues: { ...values },
        lastSavedValues: { ...values },
        fieldStatus: makeFieldRecord("idle") as Record<string, "idle" | "saving" | "saved" | "error">,
        fieldErrors: makeFieldRecord(null) as Record<string, string | null>,
        isNew: false,
      };
    }),
  };
}

// --- Reducer ---

export type LineItemsAction =
  | { type: "SET_ITEM_VALUE"; itemId: string; field: string; value: string | number | null }
  | { type: "SET_ITEM_STATUS"; itemId: string; field: string; status: "idle" | "saving" | "saved" | "error" }
  | { type: "SET_ITEM_ERROR"; itemId: string; field: string; error: string | null }
  | { type: "MARK_ITEM_SAVED"; itemId: string; field: string; value: string | number | null }
  | { type: "ADD_ITEM"; item: { id: string; sortOrder: number } }
  | { type: "REMOVE_ITEM"; itemId: string };

function updateItem(
  items: LineItemState[],
  itemId: string,
  updater: (item: LineItemState) => LineItemState
): LineItemState[] {
  return items.map((item) => (item.id === itemId ? updater(item) : item));
}

export function lineItemsReducer(
  state: LineItemsState,
  action: LineItemsAction
): LineItemsState {
  switch (action.type) {
    case "SET_ITEM_VALUE":
      return {
        ...state,
        items: updateItem(state.items, action.itemId, (item) => ({
          ...item,
          values: { ...item.values, [action.field]: action.value } as LineItemValues,
        })),
      };

    case "SET_ITEM_STATUS":
      return {
        ...state,
        items: updateItem(state.items, action.itemId, (item) => ({
          ...item,
          fieldStatus: { ...item.fieldStatus, [action.field]: action.status },
        })),
      };

    case "SET_ITEM_ERROR":
      return {
        ...state,
        items: updateItem(state.items, action.itemId, (item) => ({
          ...item,
          fieldErrors: { ...item.fieldErrors, [action.field]: action.error },
        })),
      };

    case "MARK_ITEM_SAVED":
      return {
        ...state,
        items: updateItem(state.items, action.itemId, (item) => ({
          ...item,
          lastSavedValues: { ...item.lastSavedValues, [action.field]: action.value } as LineItemValues,
        })),
      };

    case "ADD_ITEM": {
      const emptyValues: LineItemValues = {
        description: null,
        quantity: null,
        unit_price: null,
        amount: null,
      };
      const newItem: LineItemState = {
        id: action.item.id,
        sortOrder: action.item.sortOrder,
        values: emptyValues,
        originalValues: { ...emptyValues },
        lastSavedValues: { ...emptyValues },
        fieldStatus: makeFieldRecord("idle") as Record<string, "idle" | "saving" | "saved" | "error">,
        fieldErrors: makeFieldRecord(null) as Record<string, string | null>,
        isNew: true,
      };
      return { ...state, items: [...state.items, newItem] };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.itemId),
      };

    default:
      return state;
  }
}

// --- Validation ---

const NUMERIC_FIELDS = new Set<string>(["quantity", "unit_price", "amount"]);

export function validateLineItemField(
  field: string,
  value: string | number | null
): string | null {
  if (value === null || value === "") return null;

  if (NUMERIC_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num) || num < 0) return "Must be a valid number";
  }

  return null;
}
