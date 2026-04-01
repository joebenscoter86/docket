"use client";

import { useState, useEffect } from "react";
import type { TaxCodeOption } from "@/lib/accounting";

interface DefaultsCardProps {
  initialDefaultTaxCodeId: string | null;
}

export function DefaultsCard({ initialDefaultTaxCodeId }: DefaultsCardProps) {
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedValue, setSelectedValue] = useState<string>(
    initialDefaultTaxCodeId ?? ""
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  useEffect(() => {
    fetch("/api/accounting/tax-codes")
      .then((res) => res.json())
      .then((res) => {
        if (res.data) {
          setTaxCodes(res.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(value: string) {
    setSelectedValue(value);
    setSaveState("saving");

    try {
      await fetch("/api/settings/defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_tax_code_id: value || null }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="animate-pulse flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-gray-100" />
            <div className="h-3 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-8 w-44 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (taxCodes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Default tax code</p>
          <p className="text-xs text-muted mt-0.5">
            Applied automatically to new invoice line items. You can override
            per line item during review.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={saveState === "saving"}
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 min-w-[180px]"
          >
            <option value="">None</option>
            {taxCodes.map((code) => (
              <option key={code.value} value={code.value}>
                {code.label}
                {code.rate !== null ? ` (${code.rate}%)` : ""}
              </option>
            ))}
          </select>
          {saveState === "saving" && (
            <span className="text-xs text-muted">Saving...</span>
          )}
          {saveState === "saved" && (
            <span className="text-xs text-accent">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
