# DOC-23: Confidence Indicators Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual confidence indicators (colored left borders + icons) to extraction form fields, with a low-confidence banner, clearing per-field when edited.

**Architecture:** ExtractionForm reads `confidence_score` from its existing `extractedData` prop. A `ConfidenceIcon` private component renders per-field icons. The existing `isChanged()` check determines whether to show confidence styling or the "edited" blue border. No reducer, API, or database changes needed.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-doc-23-confidence-indicators-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/invoices/ExtractionForm.tsx` | Modify | Add confidence banner, `ConfidenceIcon` component, update `renderField` wrapper class logic |
| `components/invoices/ExtractionForm.test.tsx` | Create | Tests for confidence rendering and clearing behavior |

---

## Task 1: Add ConfidenceIcon component to ExtractionForm

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx` (append after `FieldStatusIcon` at line ~418)

- [ ] **Step 1: Add ConfidenceIcon function**

Add a private `ConfidenceIcon` component at the bottom of `ExtractionForm.tsx`, after the existing `FieldStatusIcon`. It accepts a `level` prop of `"high" | "medium" | "low"` and renders the appropriate SVG icon with `aria-label`.

```tsx
function ConfidenceIcon({ level }: { level: "high" | "medium" | "low" }) {
  if (level === "high") {
    return (
      <svg
        className="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="High confidence"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (level === "medium") {
    return (
      <svg
        className="h-3.5 w-3.5 text-amber-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-label="Medium confidence"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  // low
  return (
    <svg
      className="h-3.5 w-3.5 text-red-500"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-label="Low confidence"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify no lint/type errors**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean pass (component is defined but not yet used — if lint warns about unused, that's fine, it's used in the next task)

- [ ] **Step 3: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "feat: add ConfidenceIcon component to ExtractionForm (DOC-23)"
```

---

## Task 2: Add confidence banner and update field rendering

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx`

- [ ] **Step 1: Add confidence config constant**

Add a `CONFIDENCE_BORDER` config object near the top of the file (after `CURRENCY_OPTIONS` at line 35):

```tsx
const CONFIDENCE_BORDER: Record<"high" | "medium" | "low", string> = {
  high: "border-l-2 border-green-500 pl-3",
  medium: "border-l-2 border-amber-500 pl-3",
  low: "border-l-2 border-red-500 pl-3",
};
```

- [ ] **Step 2: Extract confidenceScore from extractedData**

Inside the `ExtractionForm` component function, after the existing state declarations (around line 48), add:

```tsx
const confidenceScore = extractedData.confidence_score;
```

- [ ] **Step 3: Add low-confidence banner**

In the return JSX, before the existing `{/* Section 1: Invoice Details */}` div, add the banner:

```tsx
{confidenceScore === "low" && (
  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
    <svg
      className="h-5 w-5 text-amber-500 shrink-0 mt-0.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
    <p className="text-sm text-amber-800">
      Some fields may need extra attention. Please review carefully.
    </p>
  </div>
)}
```

- [ ] **Step 4: Update renderField wrapper class logic**

In the `renderField` function, replace the existing `wrapperClass` logic (line 202):

```tsx
// BEFORE:
const wrapperClass = `relative ${changed ? "border-l-2 border-blue-500 pl-3" : "pl-0"}`;

// AFTER:
const wrapperClass = `relative ${
  changed
    ? "border-l-2 border-blue-500 pl-3"
    : confidenceScore !== null
      ? CONFIDENCE_BORDER[confidenceScore]
      : "pl-0"
}`;
```

Note: We use inline `confidenceScore !== null` checks rather than a `showConfidence` boolean variable because TypeScript cannot narrow `confidenceScore` through a boolean guard. The inline check ensures TypeScript knows `confidenceScore` is non-null when used as a `CONFIDENCE_BORDER` key.

Also note: error borders apply to the input element (`border-red-500` on the input), while confidence borders apply to the wrapper's left border. These target different elements and don't conflict, so no explicit error-state check is needed in the `wrapperClass` logic.

- [ ] **Step 5: Add ConfidenceIcon to field label**

In the `renderField` function, update the label to include `ConfidenceIcon` when the field is unchanged and confidence is available (the icon appears alongside `FieldStatusIcon`):

```tsx
// BEFORE:
<label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
  {config.label}
  <FieldStatusIcon status={status} />
</label>

// AFTER:
<label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
  {config.label}
  {!changed && confidenceScore !== null && <ConfidenceIcon level={confidenceScore} />}
  <FieldStatusIcon status={status} />
</label>
```

- [ ] **Step 6: Verify no lint/type errors**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean pass

- [ ] **Step 7: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "feat: add confidence banner and field indicators to ExtractionForm (DOC-23)"
```

---

## Task 3: Write tests for confidence indicators

**Files:**
- Create: `components/invoices/ExtractionForm.test.tsx`

This is the first component test for ExtractionForm. Tests need to mock `fetch` for auto-save on blur and mock `LineItemEditor` to isolate the component under test.

- [ ] **Step 1: Create test file with helper and mock setup**

Create `components/invoices/ExtractionForm.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExtractionForm from "./ExtractionForm";
import type { ExtractedDataRow } from "@/lib/types/invoice";

// Mock LineItemEditor to isolate ExtractionForm tests
vi.mock("./LineItemEditor", () => ({
  default: () => <div data-testid="line-item-editor" />,
}));

function makeExtractedData(
  overrides: Partial<ExtractedDataRow> = {}
): ExtractedDataRow {
  return {
    id: "ed-1",
    invoice_id: "inv-1",
    vendor_name: "Acme Corp",
    vendor_address: "123 Main St",
    invoice_number: "INV-001",
    invoice_date: "2026-01-15",
    due_date: "2026-02-15",
    payment_terms: "Net 30",
    currency: "USD",
    subtotal: 100,
    tax_amount: 10,
    total_amount: 110,
    confidence_score: null,
    raw_ai_response: null,
    model_version: null,
    extraction_duration_ms: null,
    extracted_at: "2026-01-15T00:00:00Z",
    extracted_line_items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  );
});
```

- [ ] **Step 2: Add test — renders confidence borders for each level**

```tsx
describe("ExtractionForm confidence indicators", () => {
  it.each(["high", "medium", "low"] as const)(
    "renders confidence left border on fields when confidence is %s",
    (level) => {
      const { container } = render(
        <ExtractionForm
          extractedData={makeExtractedData({ confidence_score: level })}
          invoiceId="inv-1"
        />
      );
      const borderClass =
        level === "high"
          ? "border-green-500"
          : level === "medium"
            ? "border-amber-500"
            : "border-red-500";
      const fieldsWithBorder = container.querySelectorAll(`.${borderClass}`);
      expect(fieldsWithBorder.length).toBeGreaterThan(0);
    }
  );
```

- [ ] **Step 3: Add test — renders confidence icons with aria-labels**

```tsx
  it.each(["high", "medium", "low"] as const)(
    "renders confidence icon with aria-label for %s confidence",
    (level) => {
      render(
        <ExtractionForm
          extractedData={makeExtractedData({ confidence_score: level })}
          invoiceId="inv-1"
        />
      );
      const label =
        level === "high"
          ? "High confidence"
          : level === "medium"
            ? "Medium confidence"
            : "Low confidence";
      const icons = screen.getAllByLabelText(label);
      expect(icons.length).toBeGreaterThan(0);
    }
  );
```

- [ ] **Step 4: Add test — low confidence banner**

```tsx
  it("renders low-confidence banner when confidence is low", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "low" })}
        invoiceId="inv-1"
      />
    );
    expect(
      screen.getByText("Some fields may need extra attention. Please review carefully.")
    ).toBeDefined();
  });

  it("does not render banner for high confidence", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "high" })}
        invoiceId="inv-1"
      />
    );
    expect(
      screen.queryByText("Some fields may need extra attention. Please review carefully.")
    ).toBeNull();
  });

  it("does not render banner for medium confidence", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "medium" })}
        invoiceId="inv-1"
      />
    );
    expect(
      screen.queryByText("Some fields may need extra attention. Please review carefully.")
    ).toBeNull();
  });
```

- [ ] **Step 5: Add test — no indicators when confidence is null**

```tsx
  it("renders no confidence indicators when confidence_score is null", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: null })}
        invoiceId="inv-1"
      />
    );
    expect(screen.queryByLabelText("High confidence")).toBeNull();
    expect(screen.queryByLabelText("Medium confidence")).toBeNull();
    expect(screen.queryByLabelText("Low confidence")).toBeNull();
  });
```

- [ ] **Step 6: Add test — confidence clears on field edit**

```tsx
  it("clears confidence indicator on a field when user types in it", () => {
    const { container } = render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "medium" })}
        invoiceId="inv-1"
      />
    );

    // Vendor name field should have amber border initially
    const vendorInput = screen.getByDisplayValue("Acme Corp");
    const vendorWrapper = vendorInput.closest(".border-amber-500");
    expect(vendorWrapper).not.toBeNull();

    // Type in the field to change its value
    fireEvent.change(vendorInput, { target: { value: "Acme Corp Updated" } });

    // Now the vendor wrapper should have blue border (changed), not amber
    const updatedWrapper = vendorInput.closest(".border-blue-500");
    expect(updatedWrapper).not.toBeNull();
    const amberWrapper = vendorInput.closest(".border-amber-500");
    expect(amberWrapper).toBeNull();
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- components/invoices/ExtractionForm.test.tsx`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add components/invoices/ExtractionForm.test.tsx
git commit -m "test: add confidence indicator tests for ExtractionForm (DOC-23)"
```

---

## Task 4: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run lint and type check**

Run: `npx tsc --noEmit && npm run lint`
Expected: Clean pass

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes if needed, then deliver status report**
