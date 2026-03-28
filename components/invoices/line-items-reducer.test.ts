// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  lineItemsReducer,
  initLineItemsState,
  validateLineItemField,
  type LineItemsState,
} from "./line-items-reducer";
import type { ExtractedLineItemRow } from "@/lib/types/invoice";

const MOCK_LINE_ITEMS: ExtractedLineItemRow[] = [
  {
    id: "li-1",
    description: "Web development services",
    quantity: 40,
    unit_price: 150,
    amount: 6000,
    gl_account_id: null,
    sort_order: 0,
    suggested_gl_account_id: null,
    gl_suggestion_source: null,
    is_user_confirmed: false,
    tracking: null,
  },
  {
    id: "li-2",
    description: "Domain hosting",
    quantity: 1,
    unit_price: 120,
    amount: 120,
    gl_account_id: null,
    sort_order: 1,
    suggested_gl_account_id: null,
    gl_suggestion_source: null,
    is_user_confirmed: false,
    tracking: null,
  },
];

describe("initLineItemsState", () => {
  it("initializes items from extracted line items", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items).toHaveLength(2);
    expect(state.items[0].id).toBe("li-1");
    expect(state.items[0].values.description).toBe("Web development services");
    expect(state.items[0].values.quantity).toBe(40);
    expect(state.items[0].values.unit_price).toBe(150);
    expect(state.items[0].values.amount).toBe(6000);
  });

  it("sets originalValues and lastSavedValues matching values", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items[0].originalValues).toEqual(state.items[0].values);
    expect(state.items[0].lastSavedValues).toEqual(state.items[0].values);
  });

  it("sets all field statuses to idle", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items[0].fieldStatus.description).toBe("idle");
    expect(state.items[0].fieldStatus.quantity).toBe("idle");
    expect(state.items[0].fieldStatus.unit_price).toBe("idle");
    expect(state.items[0].fieldStatus.amount).toBe("idle");
  });

  it("sets all field errors to null", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items[0].fieldErrors.description).toBeNull();
  });

  it("marks items as not new", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items[0].isNew).toBe(false);
  });

  it("preserves sort order", () => {
    const state = initLineItemsState(MOCK_LINE_ITEMS);
    expect(state.items[0].sortOrder).toBe(0);
    expect(state.items[1].sortOrder).toBe(1);
  });

  it("handles empty array", () => {
    const state = initLineItemsState([]);
    expect(state.items).toHaveLength(0);
  });

  it("handles null values in extracted items", () => {
    const items: ExtractedLineItemRow[] = [
      { id: "li-x", description: null, quantity: null, unit_price: null, amount: null, gl_account_id: null, sort_order: 0, suggested_gl_account_id: null, gl_suggestion_source: null, is_user_confirmed: false, tracking: null },
    ];
    const state = initLineItemsState(items);
    expect(state.items[0].values.description).toBeNull();
    expect(state.items[0].values.quantity).toBeNull();
  });
});

describe("lineItemsReducer", () => {
  let state: LineItemsState;

  beforeEach(() => {
    state = initLineItemsState(MOCK_LINE_ITEMS);
  });

  it("SET_ITEM_VALUE updates a field on the correct item", () => {
    const next = lineItemsReducer(state, {
      type: "SET_ITEM_VALUE",
      itemId: "li-1",
      field: "description",
      value: "Updated description",
    });
    expect(next.items[0].values.description).toBe("Updated description");
    expect(next.items[1].values.description).toBe("Domain hosting");
  });

  it("SET_ITEM_VALUE with number field", () => {
    const next = lineItemsReducer(state, {
      type: "SET_ITEM_VALUE",
      itemId: "li-1",
      field: "quantity",
      value: 50,
    });
    expect(next.items[0].values.quantity).toBe(50);
  });

  it("SET_ITEM_STATUS updates field status", () => {
    const next = lineItemsReducer(state, {
      type: "SET_ITEM_STATUS",
      itemId: "li-1",
      field: "description",
      status: "saving",
    });
    expect(next.items[0].fieldStatus.description).toBe("saving");
  });

  it("SET_ITEM_ERROR sets validation error", () => {
    const next = lineItemsReducer(state, {
      type: "SET_ITEM_ERROR",
      itemId: "li-1",
      field: "quantity",
      error: "Must be a valid amount",
    });
    expect(next.items[0].fieldErrors.quantity).toBe("Must be a valid amount");
  });

  it("SET_ITEM_ERROR with null clears the error", () => {
    let next = lineItemsReducer(state, {
      type: "SET_ITEM_ERROR",
      itemId: "li-1",
      field: "quantity",
      error: "err",
    });
    next = lineItemsReducer(next, {
      type: "SET_ITEM_ERROR",
      itemId: "li-1",
      field: "quantity",
      error: null,
    });
    expect(next.items[0].fieldErrors.quantity).toBeNull();
  });

  it("MARK_ITEM_SAVED updates lastSavedValues", () => {
    const next = lineItemsReducer(state, {
      type: "MARK_ITEM_SAVED",
      itemId: "li-1",
      field: "description",
      value: "New desc",
    });
    expect(next.items[0].lastSavedValues.description).toBe("New desc");
    expect(next.items[0].originalValues.description).toBe("Web development services");
  });

  it("ADD_ITEM appends a new empty item", () => {
    const next = lineItemsReducer(state, {
      type: "ADD_ITEM",
      item: { id: "li-new", sortOrder: 2 },
    });
    expect(next.items).toHaveLength(3);
    const newItem = next.items[2];
    expect(newItem.id).toBe("li-new");
    expect(newItem.values.description).toBeNull();
    expect(newItem.values.quantity).toBeNull();
    expect(newItem.values.unit_price).toBeNull();
    expect(newItem.values.amount).toBeNull();
    expect(newItem.isNew).toBe(true);
    expect(newItem.sortOrder).toBe(2);
  });

  it("REMOVE_ITEM removes item by ID", () => {
    const next = lineItemsReducer(state, {
      type: "REMOVE_ITEM",
      itemId: "li-1",
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).toBe("li-2");
  });

  it("REMOVE_ITEM on non-existent ID is a no-op", () => {
    const next = lineItemsReducer(state, {
      type: "REMOVE_ITEM",
      itemId: "li-999",
    });
    expect(next.items).toHaveLength(2);
  });
});

describe("validateLineItemField", () => {
  it("returns null for valid description", () => {
    expect(validateLineItemField("description", "Something")).toBeNull();
  });

  it("returns null for null values (clearing)", () => {
    expect(validateLineItemField("quantity", null)).toBeNull();
  });

  it("returns error for negative quantity", () => {
    expect(validateLineItemField("quantity", -1)).toBe("Must be a valid number");
  });

  it("returns error for NaN amount", () => {
    expect(validateLineItemField("amount", NaN)).toBe("Must be a valid number");
  });

  it("returns null for zero", () => {
    expect(validateLineItemField("unit_price", 0)).toBeNull();
  });
});
