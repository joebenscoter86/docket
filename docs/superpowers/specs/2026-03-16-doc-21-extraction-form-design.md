# DOC-21: Editable Extraction Form — Design Spec

## Overview

The right panel of the review page shows all extracted invoice fields in an editable form. Users review each field, correct extraction errors, and tab through efficiently. Edits auto-save on blur. This is the core interaction loop of the product — where AI output becomes verified data.

## Architecture

### New API Route

**`PATCH /api/invoices/[id]/extracted-data`**

- **Auth:** Verify authenticated user via RLS-aware Supabase server client
- **Ownership:** RLS-aware client ensures the user can only access their org's data. If the query returns no rows, return 404.
- **Body:** `{ field: string, value: string | number | null }`
- **Logic:**
  1. Validate `field` is in the editable fields allowlist (already enforced by `updateExtractedField()`)
  2. Fetch the `extracted_data` row by `invoice_id` (from URL params) using the RLS-aware server client. This yields the `extractedDataId`, the current field value (pre-update), and `invoice_id` for joining to get `org_id`. Return 404 if no extraction exists.
  3. Call `updateExtractedField(extractedDataId, field, value)`. If it returns `null`, return `{ error: "Failed to update field", code: "INTERNAL_ERROR" }` with status 500.
  4. If the new value differs from the pre-update value captured in step 2, call `recordCorrection(invoiceId, orgId, field, originalValue, newValue)`. The `orgId` is fetched by joining `invoices` via `extracted_data.invoice_id`.
  5. Return `{ data: { field, value, saved: true } }`
- **Logging:** Structured JSON logging at entry and exit per CLAUDE.md rule 8: `update_field_start` (entry), `update_field_success` (success with `durationMs`), `update_field_failed` (error).
- **Error responses:** Standard error format per CLAUDE.md (`{ error, code }`)

### Data Layer Addition

**`recordCorrection()` in `lib/extraction/data.ts`**

New function to insert into the `corrections` table:
```typescript
recordCorrection(invoiceId: string, orgId: string, field: string, originalValue: string | null, correctedValue: string | null): Promise<void>
```

Called by the API route when a field value differs from the original extraction.

### Form Component

**`ExtractionForm.tsx`** — client component, replaces the current stub.

**Props:**
```typescript
interface ExtractionFormProps {
  extractedData: {
    id: string;
    invoice_id: string;
    vendor_name: string | null;
    vendor_address: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    payment_terms: string | null;
    currency: string | null;
    subtotal: number | null;
    tax_amount: number | null;
    total_amount: number | null;
    confidence_score: "high" | "medium" | "low" | null;
    extracted_line_items: Array<{
      id: string;
      description: string | null;
      quantity: number | null;
      unit_price: number | null;
      amount: number | null;
      sort_order: number;
    }>;
  };
  invoiceId: string;
}
```

**State management:** `useReducer` with this shape:
```typescript
interface FormState {
  values: Record<string, string | number | null>;       // current field values
  originalValues: Record<string, string | number | null>; // values from extraction (immutable)
  fieldStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  fieldErrors: Record<string, string | null>;            // validation error messages
}
```

Actions: `SET_VALUE`, `SET_FIELD_STATUS`, `SET_FIELD_ERROR`.

## Fields & Layout

### Field Definitions

| Field | Input Type | Validation | Notes |
|-------|-----------|------------|-------|
| vendor_name | text | Required for approval | — |
| vendor_address | textarea | — | Multi-line |
| invoice_number | text | — | — |
| invoice_date | date (native) | Must be valid date | HTML `<input type="date">` |
| due_date | date (native) | Must be valid date | HTML `<input type="date">` |
| payment_terms | text | — | e.g., "Net 30" |
| currency | select | — | Options: USD, CAD, EUR, GBP, AUD. Fallback text input for others. |
| subtotal | number | Non-negative | Displayed with currency symbol |
| tax_amount | number | Non-negative | Displayed with currency symbol |
| total_amount | number | Non-negative, required for approval | Auto-calculates from subtotal + tax |

### Layout

**Desktop (md+):** Two sections stacked vertically within the right panel scroll area.

**Section 1 — Invoice Details:**
- Vendor name (full width)
- Vendor address (full width, textarea)
- Invoice number + Payment terms (two columns)
- Invoice date + Due date (two columns)
- Currency (half width)

**Section 2 — Amounts:**
- Subtotal + Tax amount (two columns)
- Total amount (full width, with auto-calc indicator)
- Mismatch warning if total ≠ subtotal + tax (amber, non-blocking)

**Mobile:** All fields single column, same order.

Section headers: "Invoice Details" and "Amounts" with `text-xs font-semibold uppercase tracking-wide text-gray-400` styling and a subtle divider.

## Behaviors

### Auto-save on Blur

1. User edits a field and tabs/clicks away (blur event)
2. If value hasn't changed from the last saved value, do nothing
3. Run inline validation — if invalid, show error, don't save
4. Set field status to `saving`
5. `fetch('PATCH /api/invoices/[id]/extracted-data', { field, value })`
6. On success: set status to `saved`, show checkmark that fades after 2 seconds
7. On error: set status to `error`, show inline error message below the field

No debounce needed since blur fires once per field exit. The save is triggered on blur, not on every keystroke.

### Changed Field Indicator

Fields where `values[field] !== originalValues[field]` get a `border-l-2 border-blue-500` left accent. This tells the user "you edited this" vs. "the AI extracted this."

### Total Auto-calculation

When subtotal or tax_amount saves successfully (in the save success callback, not via blur):
- If both subtotal and tax_amount are valid numbers, auto-update total_amount to their sum
- This programmatic update triggers its own save call immediately (not blur-triggered)
- Auto-calculated total changes DO generate correction records if they differ from the original AI extraction — this is intentional, as the correction log should reflect the final state vs. original extraction regardless of how the change was triggered
- If the user has manually set total_amount to a different value that doesn't match subtotal + tax, show an amber warning: "Total doesn't match subtotal + tax"
- The warning is informational only — it does not block saving or approval

### Field Status Indicators

Each field shows a small status indicator to the right of the label:
- **Saving:** Small spinner icon (gray)
- **Saved:** Checkmark icon (green), fades after 2s
- **Error:** Exclamation icon (red), persists until next save attempt
- **Idle:** No indicator

### Validation Rules

All validation runs on blur, before save:
- **Amounts** (subtotal, tax_amount, total_amount): Must parse as a non-negative number. Error: "Must be a valid amount"
- **Dates** (invoice_date, due_date): Native date input handles format. No additional validation needed.
- **Required fields** (vendor_name, total_amount): Show red border + "Required" text. These don't block editing, but will block the Approve action (handled by the approve route, not this form).

### Tab Order

Native HTML tab order following DOM order. Fields are rendered in this sequence:
1. vendor_name → vendor_address → invoice_number → payment_terms → invoice_date → due_date → currency → subtotal → tax_amount → total_amount

This matches the logical flow: who sent it → what it is → when it's due → how much.

## Currency Formatting

- **Display while not focused:** Format with currency symbol and 2 decimal places (e.g., "$1,234.56")
- **Display while focused:** Show raw number (e.g., "1234.56") for easy editing
- **Storage:** Plain numbers, no formatting
- Currency symbol derived from the `currency` field value. Default: `$` for USD.

Formatting is handled by a simple helper function, not a library. Supports: `$` (USD/CAD/AUD), `€` (EUR), `£` (GBP). Other currencies show the ISO code prefix.

## ReviewLayout Integration

`ReviewLayout.tsx` needs two updates:
1. Pass `invoiceId` to ExtractionForm (needed for the API route URL)
2. Update the `ReviewLayoutProps.extractedData` type from the current loose index signature (`[key: string]: unknown`) to the fully-typed interface matching `ExtractionFormProps.extractedData`. This shared type should be defined in `lib/types/invoice.ts` to avoid duplication.

## Testing

- **Unit tests** for the form reducer (state transitions)
- **Unit tests** for currency formatting helper
- **Unit tests** for validation logic
- **API route test** for the PATCH endpoint (happy path, auth failure, invalid field, validation error)
- Component rendering tests deferred — the reducer and helpers carry the logic.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/types/invoice.ts` | Add types | `ExtractedDataRow` and `ExtractedLineItemRow` shared types |
| `components/invoices/ExtractionForm.tsx` | Rewrite | Full form implementation |
| `app/api/invoices/[id]/extracted-data/route.ts` | Create | PATCH endpoint for field updates |
| `lib/extraction/data.ts` | Add function | `recordCorrection()` |
| `components/invoices/ReviewLayout.tsx` | Minor edit | Pass `invoiceId` prop to ExtractionForm |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Minor edit | Pass `invoiceId` through to ReviewLayout |
| `lib/utils/currency.ts` | Create | Currency formatting helper |
| Tests for above | Create | Unit + API route tests |

## Out of Scope

- Line item editing (DOC-22)
- Approve/sync buttons (exist in other routes)
- Form libraries (constraint: plain React state)
- Custom date picker (Phase 2 polish)
- Vendor auto-matching from QBO (Phase 3)
