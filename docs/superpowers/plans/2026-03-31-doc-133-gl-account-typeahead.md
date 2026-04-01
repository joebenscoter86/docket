# GL Account Searchable Typeahead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<select>` in GlAccountSelect with a searchable combobox/typeahead so users can type to filter GL accounts.

**Architecture:** Rewrite GlAccountSelect as a custom combobox following the same pattern as VendorSelect (text input + absolute dropdown + click-outside-to-close). Props interface unchanged, so no consumer changes needed.

**Tech Stack:** React, Tailwind CSS, Vitest + Testing Library

---

### File Map

- Rewrite: `components/invoices/GlAccountSelect.tsx` -- replace native select with combobox
- Rewrite: `components/invoices/GlAccountSelect.test.tsx` -- new tests for combobox interactions

No other files change. The props interface is identical, so LineItemEditor, ExtractionForm, and BatchSyncDialog work without modification.

---

### Task 1: Rewrite GlAccountSelect as Searchable Combobox

**Files:**
- Rewrite: `components/invoices/GlAccountSelect.tsx`

- [ ] **Step 1: Write the new GlAccountSelect component**

Replace the entire component. Keep the same props interface. The new component uses:
- `useState` for `search`, `isOpen`, `selectedId` (initialized from `currentAccountId`)
- `useRef` for `containerRef` (click-outside), `inputRef` (focus management), `savedTimer`
- `useMemo` for filtered accounts
- `useEffect` for click-outside listener (mousedown, same as VendorSelect)
- `useEffect` to sync `selectedId` when `currentAccountId` prop changes

Key behaviors:
- **Selected closed state:** Div showing account label + checkmark icon + clear "x" button. Click opens combobox.
- **Unselected closed state:** Input with placeholder "Search accounts..."
- **Open state:** Input + absolute dropdown. Empty search shows grouped accounts (reuse existing `groupByClassification`). Typing filters flat list (case-insensitive substring on `label`).
- **handleSelect:** Sets selectedId, calls `onSelect(id)`, closes dropdown, clears search. Shows save status border.
- **handleClear:** Sets selectedId to null, calls `onSelect(null)`. Shows save status.

Preserve:
- AI suggestion pill below combobox (same JSX as current)
- Learned badge below combobox (same JSX as current)
- Save status bottom border (same `STATUS_BORDER` map)
- Loading spinner and disconnected dash states (same JSX)

```tsx
"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { AccountOption } from "@/lib/accounting";

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

const CLASSIFICATION_ORDER = ["Expense", "Liability", "Asset", "Equity", "Revenue"];

function groupByClassification(
  accounts: AccountOption[]
): Array<{ classification: string; accounts: AccountOption[] }> {
  const groups = new Map<string, AccountOption[]>();
  for (const account of accounts) {
    const cls = account.classification || "Other";
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(account);
  }
  return CLASSIFICATION_ORDER.filter((cls) => groups.has(cls))
    .map((cls) => ({ classification: cls, accounts: groups.get(cls)! }))
    .concat(
      Array.from(groups.entries())
        .filter(([cls]) => !CLASSIFICATION_ORDER.includes(cls))
        .map(([cls, accts]) => ({ classification: cls, accounts: accts }))
    );
}

const STATUS_BORDER: Record<string, string> = {
  idle: "border-b-2 border-transparent",
  saving: "border-b-2 border-primary/60",
  saved: "border-b-2 border-accent",
  error: "border-b-2 border-error",
};

export default function GlAccountSelect({
  accounts,
  loading,
  connected,
  currentAccountId,
  onSelect,
  disabled = false,
  suggestedAccountId,
  suggestionSource,
}: GlAccountSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(currentAccountId);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync selectedId when prop changes (e.g. parent accepts AI suggestion)
  useEffect(() => {
    setSelectedId(currentAccountId);
  }, [currentAccountId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((a) => a.label.toLowerCase().includes(q));
  }, [accounts, search]);

  const selectedLabel = useMemo(() => {
    if (!selectedId) return null;
    return accounts.find((a) => a.value === selectedId)?.label ?? null;
  }, [selectedId, accounts]);

  const handleSelect = useCallback(
    async (accountId: string) => {
      setSelectedId(accountId);
      setIsOpen(false);
      setSearch("");
      setSaveStatus("saving");

      const ok = await onSelect(accountId);

      setSaveStatus(ok ? "saved" : "error");

      if (ok) {
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
      }
    },
    [onSelect]
  );

  const handleClear = useCallback(async () => {
    setSelectedId(null);
    setSaveStatus("saving");
    const ok = await onSelect(null);
    setSaveStatus(ok ? "saved" : "error");
    if (ok) {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }, [onSelect]);

  if (!connected && !loading) {
    return (
      <span className="text-xs text-muted" title="Connect an accounting provider to map accounts">
        —
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <svg className="h-3 w-3 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const showSuggestion = suggestedAccountId && !selectedId && suggestionSource;
  const suggestedAccount = showSuggestion
    ? accounts.find((a) => a.value === suggestedAccountId)
    : null;

  const showHistoryBadge =
    selectedId && suggestedAccountId === selectedId && suggestionSource === "history";

  const historyAccount = showHistoryBadge
    ? accounts.find((a) => a.value === suggestedAccountId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <div className={STATUS_BORDER[saveStatus]}>
        <div className="relative">
          {/* Selected display or search input */}
          {selectedId && !isOpen ? (
            <div
              className={`w-full border border-border rounded-md px-2 py-1.5 text-sm flex items-center justify-between ${disabled ? "bg-background cursor-not-allowed" : "cursor-pointer hover:border-muted"}`}
              onClick={() => {
                if (!disabled) {
                  setIsOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }
              }}
            >
              <span className="flex items-center gap-1.5 truncate">
                <svg className="h-3 w-3 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="truncate">{selectedLabel}</span>
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="text-muted hover:text-text text-xs ml-1 shrink-0"
                  aria-label="Clear account selection"
                >
                  &times;
                </button>
              )}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary"
              placeholder={accounts.length === 0 ? "No accounts found" : "Search accounts..."}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              disabled={disabled || accounts.length === 0}
            />
          )}

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
              {search ? (
                // Flat filtered list (no groups)
                filtered.length > 0 ? (
                  <ul>
                    {filtered.map((a) => (
                      <li
                        key={a.value}
                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-primary/5 ${a.value === selectedId ? "bg-primary/5 font-medium" : ""}`}
                        onClick={() => handleSelect(a.value)}
                      >
                        {a.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted">
                    No accounts match &quot;{search}&quot;
                  </p>
                )
              ) : (
                // Grouped list (no search)
                <ul>
                  {groupByClassification(accounts).map((group) => (
                    <li key={group.classification}>
                      <div className="px-3 py-1 text-xs font-semibold text-muted uppercase tracking-wide bg-background sticky top-0">
                        {group.classification}
                      </div>
                      <ul>
                        {group.accounts.map((a) => (
                          <li
                            key={a.value}
                            className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-primary/5 ${a.value === selectedId ? "bg-primary/5 font-medium" : ""}`}
                            onClick={() => handleSelect(a.value)}
                          >
                            {a.label}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Learned badge */}
      {showHistoryBadge && historyAccount && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 border border-green-200 text-xs text-green-700">
          <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="font-medium">Learned</span>
        </div>
      )}

      {/* AI suggestion pill */}
      {suggestedAccount && showSuggestion && (
        <button
          type="button"
          onClick={async () => {
            setSaveStatus("saving");
            const ok = await onSelect(suggestedAccountId!);
            setSaveStatus(ok ? "saved" : "error");
            if (ok) {
              if (savedTimer.current) clearTimeout(savedTimer.current);
              savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
            }
          }}
          disabled={disabled || saveStatus === "saving"}
          className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors text-xs text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Accept suggestion: ${suggestedAccount.label}`}
        >
          <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-600 group-hover:bg-blue-200">
            AI
          </span>
          <span className="font-medium truncate">{suggestedAccount.label}</span>
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 text-blue-400 group-hover:text-blue-600 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npx tsc --noEmit`
Expected: No type errors. Props interface is unchanged, so all consumers compile.

- [ ] **Step 3: Commit**

```bash
git add components/invoices/GlAccountSelect.tsx
git commit -m "feat: replace GL account select with searchable combobox (DOC-133)"
```

---

### Task 2: Rewrite Tests for Combobox Interactions

**Files:**
- Rewrite: `components/invoices/GlAccountSelect.test.tsx`

- [ ] **Step 1: Write the new test file**

The old tests use `screen.getByRole("combobox")` to get the native select and inspect `<option>` elements. The new tests interact with the custom combobox: clicking to open, typing to search, clicking items in the dropdown.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlAccountSelect from "./GlAccountSelect";
import type { AccountOption } from "@/lib/accounting";

const MOCK_ACCOUNTS: AccountOption[] = [
  { value: "acc-1", label: "Office Supplies", accountType: "Expense", classification: "Expense" },
  { value: "acc-2", label: "Software & Subscriptions", accountType: "Expense", classification: "Expense" },
  { value: "acc-3", label: "Professional Services", accountType: "Expense", classification: "Expense" },
  { value: "acc-4", label: "Officers Loans", accountType: "Other Current Liability", classification: "Liability" },
  { value: "acc-5", label: "Prepaid Expenses", accountType: "Other Current Asset", classification: "Asset" },
];

const defaultProps = {
  accounts: MOCK_ACCOUNTS,
  loading: false,
  connected: true,
  currentAccountId: null,
  onSelect: vi.fn().mockResolvedValue(true),
};

describe("GlAccountSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows search input with placeholder when no account is selected", () => {
    render(<GlAccountSelect {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search accounts...")).toBeInTheDocument();
  });

  it("shows classification groups when dropdown is open with no search text", () => {
    render(<GlAccountSelect {...defaultProps} />);
    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));

    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Liability")).toBeInTheDocument();
    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Office Supplies")).toBeInTheDocument();
    expect(screen.getByText("Officers Loans")).toBeInTheDocument();
  });

  it("filters accounts across all classifications when typing", async () => {
    render(<GlAccountSelect {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search accounts...");

    await userEvent.type(input, "Officer");

    expect(screen.getByText("Officers Loans")).toBeInTheDocument();
    expect(screen.queryByText("Office Supplies")).toBeNull();
    expect(screen.queryByText("Software & Subscriptions")).toBeNull();
    // Classification headers should not appear when searching
    expect(screen.queryByText("Expense")).toBeNull();
    expect(screen.queryByText("Liability")).toBeNull();
  });

  it("shows no-match message when search has no results", async () => {
    render(<GlAccountSelect {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search accounts...");

    await userEvent.type(input, "zzzzz");

    expect(screen.getByText(/No accounts match/)).toBeInTheDocument();
  });

  it("calls onSelect when clicking an account in the dropdown", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<GlAccountSelect {...defaultProps} onSelect={onSelect} />);

    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));
    fireEvent.click(screen.getByText("Office Supplies"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("acc-1");
    });
  });

  it("shows selected account with clear button when account is selected", () => {
    render(<GlAccountSelect {...defaultProps} currentAccountId="acc-1" />);

    expect(screen.getByText("Office Supplies")).toBeInTheDocument();
    expect(screen.getByLabelText("Clear account selection")).toBeInTheDocument();
  });

  it("calls onSelect(null) when clear button is clicked", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<GlAccountSelect {...defaultProps} currentAccountId="acc-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText("Clear account selection"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  it("closes dropdown on outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <GlAccountSelect {...defaultProps} />
      </div>
    );

    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));
    expect(screen.getByText("Office Supplies")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Office Supplies")).toBeNull();
  });

  it("shows clickable AI suggestion pill when suggestedAccountId is provided and no account selected", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    const pill = screen.getByTitle(/Accept suggestion/i);
    expect(pill).toBeInTheDocument();
    expect(screen.getByText("Software & Subscriptions")).toBeInTheDocument();
    const badges = screen.getAllByText("AI");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSelect when AI suggestion pill is clicked", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(
      <GlAccountSelect
        {...defaultProps}
        onSelect={onSelect}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    fireEvent.click(screen.getByTitle(/Accept suggestion/i));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("acc-2");
    });
  });

  it("does not show AI suggestion pill when account is already selected", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-1"
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
  });

  it("shows Learned badge when suggestionSource is history and account is pre-filled", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-2"
        suggestedAccountId="acc-2"
        suggestionSource="history"
      />
    );

    expect(screen.getByText("Learned")).toBeInTheDocument();
    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
  });

  it("shows dash when not connected", () => {
    render(<GlAccountSelect {...defaultProps} connected={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    render(<GlAccountSelect {...defaultProps} loading={true} />);
    expect(screen.getByText("—").parentElement?.querySelector(".animate-spin") || document.querySelector(".animate-spin")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm run test -- components/invoices/GlAccountSelect.test.tsx`
Expected: All tests pass.

- [ ] **Step 3: Fix any test failures**

If any tests fail due to DOM structure differences, adjust selectors to match the actual rendered output. The component code from Task 1 is the source of truth.

- [ ] **Step 4: Commit**

```bash
git add components/invoices/GlAccountSelect.test.tsx
git commit -m "test: rewrite GL account select tests for combobox interactions (DOC-133)"
```

---

### Task 3: Verify Full Build & Lint

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass, including existing LineItemEditor and ReviewLayout tests that use GlAccountSelect.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build completes successfully.
