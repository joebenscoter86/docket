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

  const showSuggestion = suggestedAccountId && !selectedId && suggestionSource === "ai";
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
