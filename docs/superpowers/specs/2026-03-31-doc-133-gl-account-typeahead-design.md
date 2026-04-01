# DOC-133: GL Account Searchable Typeahead

**Date:** 2026-03-31
**Source:** Rick Smith feedback -- GL account dropdown requires scrolling through a long list. Wants to type and filter.

## Problem

GlAccountSelect uses a native `<select>` with `<optgroup>` for classification grouping. No search/filter capability. Users with many GL accounts must scroll through the entire list to find what they need.

## Solution

Replace the native `<select>` with a searchable combobox/typeahead, following the same pattern already established by VendorSelect.

## Behavior

### Closed state (account selected)
Shows the selected account name with a checkmark icon and an "x" clear button. Clicking opens the combobox. Same visual pattern as VendorSelect's selected state.

### Closed state (no account selected)
Shows a text input with placeholder "Search accounts..." Clicking or focusing opens the dropdown.

### Open state
Text input for filtering + dropdown list below.
- Typing filters accounts across all classifications (case-insensitive substring match on `label`).
- When the search field is empty, accounts are grouped under classification headers (Expense, Liability, Asset, Equity, Revenue) using the existing `groupByClassification` function and `CLASSIFICATION_ORDER`.
- When the user types, the list flattens to show only matches -- no group headers.

### Interactions
- Click outside closes the dropdown (mousedown listener, same as VendorSelect).
- Clicking an account triggers `onSelect(accountId)`, closes dropdown, clears search.
- Clear button ("x") calls `onSelect(null)`.

## Preserved Features

- **AI suggestion pill:** Shown below the combobox when `suggestedAccountId` is set, `currentAccountId` is null, and `suggestionSource === "ai"`. Clicking calls `onSelect` directly. No changes to this behavior.
- **"Learned" badge:** Shown below when `currentAccountId === suggestedAccountId` and `suggestionSource === "history"`. No changes.
- **Save status border:** Bottom border animation (idle/saving/saved/error) stays as-is.
- **Loading state:** Spinner, unchanged.
- **Disconnected state:** Shows dash, unchanged.

## What Changes

| Before | After |
|--------|-------|
| Native `<select>` element | Custom combobox (input + dropdown div) |
| `<optgroup>` for classification groups | Styled classification headers in dropdown (hidden when searching) |
| `handleChange` via select onChange | `handleSelect` from dropdown click + `handleClear` button |
| No filtering | Case-insensitive substring filter on account label |

## Sizing & Layout

The component sits in LineItemEditor grid cells. Stays compact: same `px-2 py-1.5 text-sm` as the current select. The dropdown extends outside the grid cell via `absolute z-10` positioning, `max-h-48 overflow-y-auto`.

## Props Interface

No changes to the props interface. Same inputs, same outputs:

```typescript
interface GlAccountSelectProps {
  accounts: AccountOption[];
  loading: boolean;
  connected: boolean;
  currentAccountId: string | null;
  onSelect: (accountId: string | null) => Promise<boolean>;
  disabled?: boolean;
  suggestedAccountId?: string | null;
  suggestionSource?: "ai" | "history" | null;
}
```

## Tests

Rewrite `GlAccountSelect.test.tsx` to match the new combobox interaction model:

1. Search filtering works (type "Officer", see "Officers Loans")
2. Classification groups shown when no search text
3. Groups hidden when searching
4. AI suggestion pill still works (render + click)
5. Learned badge still works
6. Clear button calls onSelect(null)
7. Click outside closes dropdown
8. Loading and disconnected states unchanged

## Files Changed

- `components/invoices/GlAccountSelect.tsx` -- full rewrite to combobox
- `components/invoices/GlAccountSelect.test.tsx` -- rewrite tests for new interaction model

No other files need changes. The props interface is unchanged, so LineItemEditor, ExtractionForm, and BatchSyncDialog continue to work without modification.
