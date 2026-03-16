import { describe, it, expect, beforeEach } from "vitest";
import {
  formReducer,
  initFormState,
  validateField,
  type FormState,
} from "./extraction-form-reducer";

const MOCK_EXTRACTED = {
  vendor_name: "Acme Corp",
  vendor_address: "123 Main St",
  invoice_number: "INV-001",
  invoice_date: "2026-03-01",
  due_date: "2026-03-31",
  payment_terms: "Net 30",
  currency: "USD",
  subtotal: 900,
  tax_amount: 90,
  total_amount: 990,
};

describe("initFormState", () => {
  it("initializes values and originalValues from extracted data", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.values.vendor_name).toBe("Acme Corp");
    expect(state.originalValues.vendor_name).toBe("Acme Corp");
    expect(state.values.subtotal).toBe(900);
  });

  it("initializes lastSavedValues matching values", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.lastSavedValues.vendor_name).toBe("Acme Corp");
    expect(state.lastSavedValues.subtotal).toBe(900);
  });

  it("sets all field statuses to idle", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.fieldStatus.vendor_name).toBe("idle");
    expect(state.fieldStatus.total_amount).toBe("idle");
  });

  it("sets all field errors to null", () => {
    const state = initFormState(MOCK_EXTRACTED);
    expect(state.fieldErrors.vendor_name).toBeNull();
  });
});

describe("formReducer", () => {
  let state: FormState;

  beforeEach(() => {
    state = initFormState(MOCK_EXTRACTED);
  });

  it("SET_VALUE updates the value for a field", () => {
    const next = formReducer(state, {
      type: "SET_VALUE",
      field: "vendor_name",
      value: "New Vendor",
    });
    expect(next.values.vendor_name).toBe("New Vendor");
    expect(next.originalValues.vendor_name).toBe("Acme Corp");
  });

  it("SET_FIELD_STATUS updates status for a field", () => {
    const next = formReducer(state, {
      type: "SET_FIELD_STATUS",
      field: "vendor_name",
      status: "saving",
    });
    expect(next.fieldStatus.vendor_name).toBe("saving");
  });

  it("SET_FIELD_ERROR updates error for a field", () => {
    const next = formReducer(state, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: "Must be a valid amount",
    });
    expect(next.fieldErrors.subtotal).toBe("Must be a valid amount");
  });

  it("SET_FIELD_ERROR with null clears the error", () => {
    let next = formReducer(state, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: "Must be a valid amount",
    });
    next = formReducer(next, {
      type: "SET_FIELD_ERROR",
      field: "subtotal",
      error: null,
    });
    expect(next.fieldErrors.subtotal).toBeNull();
  });

  it("MARK_SAVED updates lastSavedValues for a field", () => {
    const next = formReducer(state, {
      type: "MARK_SAVED",
      field: "vendor_name",
      value: "New Vendor",
    });
    expect(next.lastSavedValues.vendor_name).toBe("New Vendor");
    expect(next.values.vendor_name).toBe("Acme Corp");
    expect(next.originalValues.vendor_name).toBe("Acme Corp");
  });
});

describe("validateField", () => {
  it("returns null for valid vendor_name", () => {
    expect(validateField("vendor_name", "Acme")).toBeNull();
  });

  it("returns error for negative subtotal", () => {
    expect(validateField("subtotal", -10)).toBe("Must be a valid amount");
  });

  it("returns error for NaN amount", () => {
    expect(validateField("subtotal", NaN)).toBe("Must be a valid amount");
  });

  it("returns null for zero amount", () => {
    expect(validateField("subtotal", 0)).toBeNull();
  });

  it("returns null for null amount (clearing the field)", () => {
    expect(validateField("subtotal", null)).toBeNull();
  });

  it("returns null for valid dates", () => {
    expect(validateField("invoice_date", "2026-03-01")).toBeNull();
  });

  it("returns null for null date (clearing)", () => {
    expect(validateField("invoice_date", null)).toBeNull();
  });
});
