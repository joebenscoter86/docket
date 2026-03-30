"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { VendorOption } from "@/lib/accounting";

/** Strip common suffixes and punctuation for fuzzy vendor matching */
function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|corporation|incorporated|limited|company|pty|plc)\b\.?/g, "")
    .replace(/[.,;:!'"()\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface VendorSelectProps {
  vendors: VendorOption[];
  loading: boolean;
  connected: boolean;
  error: string | null;
  currentVendorRef: string | null;
  vendorName: string | null;
  onSelect: (vendorRef: string | null) => Promise<boolean>;
  disabled?: boolean;
  vendorAddress?: string | null;
  onVendorCreated?: (vendor: VendorOption) => void;
  providerLabel?: string;
}

export default function VendorSelect({
  vendors,
  loading,
  connected,
  error,
  currentVendorRef,
  vendorName,
  onSelect,
  disabled = false,
  vendorAddress = null,
  onVendorCreated,
  providerLabel = "your accounting software",
}: VendorSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(currentVendorRef);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoMatchedRef = useRef(false);
  const [wasAutoMatched, setWasAutoMatched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createErrorTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-match on first load using fuzzy normalized matching
  useEffect(() => {
    if (
      autoMatchedRef.current ||
      selectedRef ||
      !vendorName ||
      vendors.length === 0
    ) {
      return;
    }
    autoMatchedRef.current = true;

    const normalizedName = normalizeVendorName(vendorName);

    // Pass 1: exact normalized match
    const exactMatches = vendors.filter(
      (v) => normalizeVendorName(v.label) === normalizedName
    );
    if (exactMatches.length === 1) {
      setSelectedRef(exactMatches[0].value);
      setWasAutoMatched(true);
      onSelect(exactMatches[0].value);
      return;
    }

    // Pass 2: one side starts with the other (only if unambiguous)
    const startsWithMatches = vendors.filter((v) => {
      const norm = normalizeVendorName(v.label);
      return norm.startsWith(normalizedName) || normalizedName.startsWith(norm);
    });
    if (startsWithMatches.length === 1) {
      setSelectedRef(startsWithMatches[0].value);
      setWasAutoMatched(true);
      onSelect(startsWithMatches[0].value);
    }
  }, [vendors, vendorName, selectedRef, onSelect]);

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
    if (!search) return vendors;
    const q = search.toLowerCase();
    return vendors.filter((v) => v.label.toLowerCase().includes(q));
  }, [vendors, search]);

  const selectedLabel = useMemo(() => {
    if (!selectedRef) return null;
    return vendors.find((v) => v.value === selectedRef)?.label ?? null;
  }, [selectedRef, vendors]);

  const handleSelect = useCallback(
    async (vendorRef: string) => {
      setSelectedRef(vendorRef);
      setWasAutoMatched(false);
      setIsOpen(false);
      setSearch("");
      setSaving(true);
      setSaveStatus("idle");

      const ok = await onSelect(vendorRef);

      setSaving(false);
      setSaveStatus(ok ? "saved" : "error");

      if (ok) {
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
      }
    },
    [onSelect]
  );

  const handleClear = useCallback(async () => {
    setSelectedRef(null);
    setWasAutoMatched(false);
    setSaving(true);
    const ok = await onSelect(null);
    setSaving(false);
    setSaveStatus(ok ? "saved" : "error");
    if (ok) {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }, [onSelect]);

  const handleCreateVendor = useCallback(async () => {
    if (!vendorName || creating) return;

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/accounting/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: vendorName.trim(),
          address: vendorAddress,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setCreateError(json.error ?? "Failed to create vendor.");
        if (createErrorTimer.current) clearTimeout(createErrorTimer.current);
        createErrorTimer.current = setTimeout(() => setCreateError(null), 10000);
        setCreating(false);
        return;
      }

      const newVendor: VendorOption = json.data;

      // Notify parent to add to vendor list
      onVendorCreated?.(newVendor);

      // Auto-select the new vendor
      setCreating(false);
      setIsOpen(false);
      setSearch("");
      await handleSelect(newVendor.value);
    } catch {
      setCreateError("Failed to create vendor. Please try again.");
      if (createErrorTimer.current) clearTimeout(createErrorTimer.current);
      createErrorTimer.current = setTimeout(() => setCreateError(null), 10000);
      setCreating(false);
    }
  }, [vendorName, vendorAddress, creating, onVendorCreated, handleSelect]);

  // Not connected state
  if (!connected && !loading) {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          Sync as
        </label>
        <p className="text-sm text-warning">
          {error ?? `Connect ${providerLabel} in Settings to map vendors.`}
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          Sync as
        </label>
        <div className="flex items-center gap-2 text-sm text-muted">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading vendors...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <label className="flex items-center gap-2 text-sm font-medium text-text mb-1">
        Sync as
        {saving && (
          <svg className="h-3.5 w-3.5 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {saveStatus === "saved" && (
          <svg className="h-3.5 w-3.5 text-accent" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {saveStatus === "error" && (
          <svg className="h-3.5 w-3.5 text-error" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
        {wasAutoMatched && selectedRef && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-accent/10 text-accent">
            Auto-matched
          </span>
        )}
        {!selectedRef && !saving && autoMatchedRef.current && vendors.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-warning/10 text-warning">
            No match found
          </span>
        )}
      </label>

      <div className="relative">
        {/* Selected display / search input */}
        {selectedRef && !isOpen ? (
          <div
            className={`w-full border border-border rounded-md px-3 py-2 text-sm flex items-center justify-between ${disabled ? "bg-background cursor-not-allowed" : "cursor-pointer hover:border-muted"}`}
            onClick={() => { if (!disabled) { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); } }}
          >
            <span className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {selectedLabel}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                className="text-muted hover:text-muted text-xs"
                aria-label="Clear vendor selection"
              >
                &times;
              </button>
            )}
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary"
            placeholder={
              vendors.length === 0 && connected
                ? "Type to search or create a vendor..."
                : vendors.length === 0
                  ? `No vendors found in ${providerLabel}`
                  : "Search vendors..."
            }
            value={search}
            onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled || (vendors.length === 0 && !connected)}
          />
        )}

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {vendorName && connected && (
              <div className={`px-3 py-2 ${filtered.length > 0 ? "border-b border-border" : ""}`}>
                <button
                  type="button"
                  onClick={handleCreateVendor}
                  disabled={creating}
                  className="w-full text-left text-sm text-primary hover:text-primary-hover font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 py-1"
                >
                  {creating ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>+ Create &quot;{vendorName.trim()}&quot; as a new vendor in {providerLabel}</>
                  )}
                </button>
                {!creating && !createError && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    This will add a new vendor to your accounting system.
                  </p>
                )}
                {createError && (
                  <p className="mt-1 text-xs text-error">{createError}</p>
                )}
              </div>
            )}
            {filtered.length > 0 ? (
              <ul>
                {filtered.map((v) => (
                  <li
                    key={v.value}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary/5 ${v.value === selectedRef ? "bg-primary/5 font-medium" : ""}`}
                    onClick={() => handleSelect(v.value)}
                  >
                    {v.label}
                  </li>
                ))}
              </ul>
            ) : search ? (
              <p className="px-3 py-2 text-sm text-muted">
                No vendors match &quot;{search}&quot;
              </p>
            ) : null}
          </div>
        )}
      </div>

      {!selectedRef && !isOpen && (
        <p className="mt-1 text-xs text-muted">
          {autoMatchedRef.current && vendors.length > 0
            ? `No matching vendor was found in ${providerLabel}. Select one from the dropdown, or create a new one.`
            : `Select which vendor in ${providerLabel} this invoice should be filed under.`}
        </p>
      )}
      {wasAutoMatched && selectedRef && (
        <p className="mt-1 text-xs text-muted">
          Docket matched this vendor automatically. You can change it if needed.
        </p>
      )}
    </div>
  );
}
