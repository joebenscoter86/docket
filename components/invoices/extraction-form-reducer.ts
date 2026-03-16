const FORM_FIELDS = [
  "vendor_name",
  "vendor_address",
  "invoice_number",
  "invoice_date",
  "due_date",
  "payment_terms",
  "currency",
  "subtotal",
  "tax_amount",
  "total_amount",
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

const AMOUNT_FIELDS = new Set<string>(["subtotal", "tax_amount", "total_amount"]);

export interface FormState {
  values: Record<string, string | number | null>;
  originalValues: Record<string, string | number | null>;
  lastSavedValues: Record<string, string | number | null>;
  fieldStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  fieldErrors: Record<string, string | null>;
}

export type FormAction =
  | { type: "SET_VALUE"; field: string; value: string | number | null }
  | {
      type: "SET_FIELD_STATUS";
      field: string;
      status: "idle" | "saving" | "saved" | "error";
    }
  | { type: "SET_FIELD_ERROR"; field: string; error: string | null }
  | { type: "MARK_SAVED"; field: string; value: string | number | null };

export function initFormState(
  extracted: Record<string, string | number | null>
): FormState {
  const values: Record<string, string | number | null> = {};
  const originalValues: Record<string, string | number | null> = {};
  const lastSavedValues: Record<string, string | number | null> = {};
  const fieldStatus: Record<string, "idle" | "saving" | "saved" | "error"> = {};
  const fieldErrors: Record<string, string | null> = {};

  for (const field of FORM_FIELDS) {
    const val = extracted[field] ?? null;
    values[field] = val;
    originalValues[field] = val;
    lastSavedValues[field] = val;
    fieldStatus[field] = "idle";
    fieldErrors[field] = null;
  }

  return { values, originalValues, lastSavedValues, fieldStatus, fieldErrors };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_VALUE":
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
      };
    case "SET_FIELD_STATUS":
      return {
        ...state,
        fieldStatus: { ...state.fieldStatus, [action.field]: action.status },
      };
    case "SET_FIELD_ERROR":
      return {
        ...state,
        fieldErrors: { ...state.fieldErrors, [action.field]: action.error },
      };
    case "MARK_SAVED":
      return {
        ...state,
        lastSavedValues: { ...state.lastSavedValues, [action.field]: action.value },
      };
    default:
      return state;
  }
}

export function validateField(
  field: string,
  value: string | number | null
): string | null {
  if (value === null || value === "") return null;

  if (AMOUNT_FIELDS.has(field)) {
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num) || num < 0) return "Must be a valid amount";
  }

  return null;
}

export { FORM_FIELDS };
