# DOC-22: Line Items Editor Design Spec

**Date:** 2026-03-16
**Issue:** DOC-22 — REV-4: Line items editor (add/remove/edit, auto-recalculate totals)
**Depends on:** DOC-21 (extraction form) — complete

## Overview

Build an inline-editable line items table within the review form. Users can correct AI-extracted line items, add missing ones, and remove hallucinated ones. Amounts auto-recalculate and cascade up to the form's subtotal/total fields.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Compact table (not stacked cards) | Right panel is 50% viewport. Invoices have 1-20+ items. Table optimizes for scan speed, which is what accounting users expect. |
| Drag-to-reorder | Deferred (not in MVP) | Low value for invoice review. `sort_order` DB field already exists for when we add it later. No new dependencies. |
| Save pattern | Per-cell on blur (same as ExtractionForm) | Consistent with existing UX. MVP volume doesn't justify batch saves. |
| Save status indicator | Thin colored bottom border on input (not icon) | Deliberate divergence from ExtractionForm's `FieldStatusIcon` pattern. Table cells are too compact for icons. Border: blue=saving, green=saved, red=error. |

## Component Structure

### New files

- `components/invoices/LineItemEditor.tsx` — replaces the current stub
- `components/invoices/line-items-reducer.ts` — state management (mirrors `extraction-form-reducer.ts` pattern)
- `app/api/invoices/[id]/line-items/route.ts` — POST (create) + GET (unused for now, but conventional)
- `app/api/invoices/[id]/line-items/[itemId]/route.ts` — PATCH (update field) + DELETE (remove)
- Test files co-located with each source file

### Integration changes to ExtractionForm

`ExtractionForm` currently receives `{ extractedData, invoiceId }`. It must be modified to:

1. **Extract line items and IDs from existing props** — `extractedData.extracted_line_items` provides the line items array, `extractedData.id` provides the `extractedDataId`. No new props needed on ExtractionForm itself; it derives everything from `extractedData`.

2. **Add `onSubtotalChange` handler** — when LineItemEditor reports a new subtotal, ExtractionForm dispatches `SET_VALUE` for `subtotal`, then triggers a save + total recalculation (subtotal + tax = total) using the existing `handleBlur`/`saveField` flow.

3. **Render LineItemEditor** between the divider and the "Amounts" section heading. New section order: Invoice Details → divider → **Line Items** → divider → Amounts.

**LineItemEditor props:**
- `lineItems: ExtractedLineItemRow[]` (from `extractedData.extracted_line_items`)
- `invoiceId: string`
- `extractedDataId: string` (from `extractedData.id` — FK to `extracted_data`, not `invoices`)
- `currency: string` (derived from form state, for formatting)
- `onSubtotalChange: (newSubtotal: number) => void`

## UI Design

### Table layout

Compact grid with columns:

| Column | Width | Type | Notes |
|--------|-------|------|-------|
| Description | flex (fills remaining) | text input | Placeholder: "Description" |
| Qty | ~70px | number input | Right-aligned. Placeholder: "0" |
| Unit Price | ~100px | currency input | Right-aligned. Same focus/blur formatting as ExtractionForm currency fields |
| Amount | ~100px | currency input (auto-calc) | Right-aligned. Auto-fills from qty × unit_price. User can override. Slightly muted background to signal "calculated". |
| Remove | 32px | × button | Removes row on click |

Column headers: `text-xs font-medium text-gray-500 uppercase`. Sticky if the list scrolls within the panel.

### Editing behavior

- All cells are inline editable inputs matching ExtractionForm input styling (`border border-gray-200 rounded-md px-3 py-2 text-sm`)
- Currency fields use `formatCurrency`/`parseCurrencyInput` from `lib/utils/currency.ts`
- Tab order flows left-to-right, top-to-bottom through the table
- Auto-calc: when qty or unit_price changes on blur, if both are non-null, set amount = qty × unit_price. Amount field remains editable (user can override for discounts/rounding). If the user manually overrides amount, subsequent changes to qty or unit_price will re-trigger auto-calc (overwriting the override). This is intentional — if you're changing qty, you almost certainly want the amount recalculated.

### Auto-save on blur

Same pattern as ExtractionForm:
1. User edits cell, tabs/clicks away
2. Validate (amounts must be valid numbers)
3. Skip save if value unchanged from last saved
4. `PATCH /api/invoices/[id]/line-items/[itemId]` with `{ field, value }`
5. Show save status via input bottom border (blue=saving, green=saved 2s, red=error)
6. On save of amount field → recalculate subtotal → call `onSubtotalChange`

### Add line item

"+ Add line item" link below the table. Styled: `text-sm text-blue-600 hover:text-blue-700`.
- Button shows a loading spinner while the POST is in-flight. Disabled during request to prevent double-clicks.
- Calls `POST /api/invoices/[id]/line-items` to create server-side first (not optimistic — we need the real DB ID)
- On success, appends new empty row to local state with the returned ID
- New row gets focus on the description field
- On failure, show brief inline error below the button ("Failed to add line item. Try again.")

### Remove line item

× button on each row. Click behavior:
- If 2+ items remain: remove immediately (no confirmation). Calls `DELETE` endpoint.
- If last item: show inline confirmation text "Remove last item?" with "Yes" / "Cancel" links replacing the × button. Prevents accidental removal of all items.
- On removal: recalculate subtotal, call `onSubtotalChange`
- Optimistic removal from UI, revert on API failure with error toast/indicator

### Empty state

When no line items exist (extraction found none, or user removed all):
```
No line items were extracted. You can add them manually below.
[+ Add line item]
```
Centered, `text-sm text-gray-400`.

### Subtotal cascade

When any line item `amount` changes (via edit or auto-calc):
1. Sum all line item amounts → new subtotal
2. Call `onSubtotalChange(newSubtotal)`
3. ExtractionForm updates subtotal field value + saves it
4. ExtractionForm auto-calculates total = subtotal + tax (existing behavior)

This creates a live chain: line item amount → subtotal → total.

## State Management

### `line-items-reducer.ts`

```typescript
interface LineItemValues {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

interface LineItemsState {
  items: LineItemState[];
}

interface LineItemState {
  id: string;              // DB id
  sortOrder: number;       // From DB, used for render order (read-only in MVP)
  values: LineItemValues;
  originalValues: LineItemValues;   // From extraction, for change detection
  lastSavedValues: LineItemValues;  // For skip-if-unchanged logic
  fieldStatus: Record<string, 'idle' | 'saving' | 'saved' | 'error'>;
  fieldErrors: Record<string, string | null>;
  isNew: boolean;           // True for user-added items (no original values)
}
```

Actions:
- `INIT_ITEMS` — hydrate from extracted line items
- `SET_ITEM_VALUE` — update a field on a specific item
- `SET_ITEM_STATUS` — update save status for a field
- `SET_ITEM_ERROR` — set validation error
- `MARK_ITEM_SAVED` — mark field as saved, update lastSavedValues
- `ADD_ITEM` — append new empty item with given ID
- `REMOVE_ITEM` — remove item by ID

## API Routes

### `POST /api/invoices/[id]/line-items`

Creates a new empty line item.

- Auth: verify user owns invoice via org_memberships
- Body: `{ extracted_data_id: string }`
- Creates row in `extracted_line_items` with null fields, `sort_order` = max existing + 1
- Returns: `{ data: ExtractedLineItemRow }`

### `PATCH /api/invoices/[id]/line-items/[itemId]`

Updates a single field on a line item.

- Auth: verify user owns invoice via org_memberships
- Body: `{ field: string, value: string | number | null }`
- Allowed fields: `description`, `quantity`, `unit_price`, `amount`
- Validates field is in allowlist
- Records correction in `corrections` table. Field format: `line_item.{itemId}.{fieldName}` — this extends the existing convention (header fields use bare names like `vendor_name`) because line item corrections need the item ID to disambiguate which row was corrected. The `recordCorrection` function accepts freeform `field_name` text, so no changes needed there.
- Returns: `{ data: ExtractedLineItemRow }`

### `DELETE /api/invoices/[id]/line-items/[itemId]`

Removes a line item.

- Auth: verify user owns invoice via org_memberships
- Deletes row from `extracted_line_items`
- Returns: `{ data: { deleted: true } }` (200 OK, consistent with project API response convention)

All routes use structured logging (`logger.info`/`logger.error`) with `{ action, invoiceId, itemId?, orgId, userId, status }`.

## Testing Plan

### Unit tests (`line-items-reducer.test.ts`)
- Init from extracted items
- Set value, mark saved, change detection
- Add item, remove item
- Auto-calc amount from qty × unit_price
- Remove last item vs. remove non-last

### Component tests (`LineItemEditor.test.tsx`)
- Renders line items in table format
- Edit cell → blur → saves via API
- Auto-calc amount on qty/unit_price change
- Add line item → API call → new row appears
- Remove line item → API call → row disappears
- Last item removal shows confirmation
- Empty state renders correctly
- Subtotal callback fires on amount change

### API route tests
- Happy path for POST, PATCH, DELETE
- Auth failure (unauthenticated)
- Validation error (invalid field name in PATCH)
- Not found (invalid itemId)

## Out of Scope

- Drag-to-reorder (deferred, `sort_order` field ready)
- GL account mapping (Phase 3)
- Batch save / debouncing
- Inline row duplication
