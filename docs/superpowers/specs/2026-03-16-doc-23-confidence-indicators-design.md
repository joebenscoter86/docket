# DOC-23: Confidence Indicators Design Spec

## Overview

Add visual confidence indicators to the extraction review form so users immediately see which fields the AI is confident about and which need extra attention. Confidence is invoice-level for MVP (not per-field). Indicators clear per-field when the user edits that field.

## Requirements (from Linear)

1. Parse the confidence score from extracted data (high/medium/low)
2. Add visual confidence indicators to each field in the review form
3. Show a banner when overall confidence is "low"
4. Remove the confidence indicator on a field after the user edits it
5. Informational only — does not block approval
6. Accessible — icons alongside colors for colorblind users

## Design

### Data Flow

`ExtractionForm` already receives `extractedData: ExtractedDataRow` which includes `confidence_score`. Rather than adding a separate prop, the component reads `extractedData.confidence_score` directly. This avoids prop duplication since the type already carries the field. ReviewLayout already uses `confidence_score` for the header dot indicator — ExtractionForm now also consumes it for field-level styling.

When `confidence_score` is `null` (e.g., extraction failed to produce one), no confidence-related UI elements are rendered — no banner, no borders, no icons.

### Confidence Banner

When `confidence_score === "low"`, render an amber banner at the top of ExtractionForm:

- Background: `bg-amber-50 border border-amber-200 rounded-md p-3`
- Icon: warning triangle (amber)
- Text: "Some fields may need extra attention. Please review carefully."
- No banner for `"high"` or `"medium"` confidence

### Field-Level Indicators

Each form field gets a colored left border and a small icon next to the field label, based on the invoice-level confidence score:

| Confidence | Left Border | Icon | Color |
|-----------|-------------|------|-------|
| high | `border-l-2 border-green-500` | Checkmark circle | `text-green-500` |
| medium | `border-l-2 border-amber-500` | Warning triangle | `text-amber-500` |
| low | `border-l-2 border-red-500` | Alert circle | `text-red-500` |

Icons are small (3.5x3.5 / `h-3.5 w-3.5`) and positioned next to the field label, similar to the existing `FieldStatusIcon`. Each icon has an `aria-label` for screen readers.

`ConfidenceIcon` is a private function at the bottom of `ExtractionForm.tsx`, following the same pattern as `FieldStatusIcon`.

### Clearing on Edit

The form already tracks whether a field has been changed via `isChanged(field)` (compares current value to `originalValues`). The logic is:

- **Field NOT changed:** Show confidence border + icon
- **Field changed:** Show existing blue "changed" border (`border-l-2 border-blue-500`) — no confidence icon

These are mutually exclusive. The blue border already communicates "human-verified." No reducer changes needed.

### Interaction with Existing States

Priority order for left border styling:
1. **Error state** (`fieldError` present): red error border on the input (existing)
2. **Changed/edited**: blue left border (existing)
3. **Confidence indicator**: colored left border based on confidence score (new)
4. **Default**: no left border (no confidence score available)

The confidence icon appears in the label row alongside `FieldStatusIcon`. Both can be visible simultaneously (e.g., confidence icon + saving spinner).

## Files Changed

| File | Change |
|------|--------|
| `components/invoices/ExtractionForm.tsx` | Add confidence banner, `ConfidenceIcon` component, update `renderField` wrapper class logic (reads `confidence_score` from existing `extractedData` prop) |
| `components/invoices/ExtractionForm.test.tsx` | Tests for confidence rendering and clearing behavior |

## Not Changed

- `extraction-form-reducer.ts` — no state changes needed, `isChanged` logic already exists
- No API changes
- No database changes
- No new dependencies

### Note: Auto-Calculated Fields

When the user edits `subtotal` or `tax_amount`, `total_amount` is auto-recalculated and will show as "changed" (blue border). Meanwhile, other unedited fields retain their confidence indicators. This asymmetry is correct — it reflects which fields have been human-verified.

## Testing

This is the first component test file for ExtractionForm. Tests will need to mock `fetch` for the auto-save behavior that fires on blur.

- Renders confidence border + icon on all fields when confidence is high/medium/low
- Renders low-confidence banner only when confidence is "low"
- No banner for high/medium confidence
- Confidence indicator clears on a specific field when user edits it (changed fields show blue border instead)
- Confidence icon has aria-label for accessibility
- No confidence indicators when confidence_score is null
