"use client";

import { useState, useEffect } from "react";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { ToggleSwitch } from "@/components/settings/ToggleSwitch";
import type { TaxCodeOption } from "@/lib/accounting";

interface PreferencesCardProps {
  isConnected: boolean;
  initialDefaultTaxCodeId: string | null;
}

interface EmailPreferences {
  extraction_notifications: boolean;
  sync_notifications: boolean;
  marketing_emails: boolean;
}

export function PreferencesCard({ isConnected, initialDefaultTaxCodeId }: PreferencesCardProps) {
  // Tax code state
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);
  const [selectedTaxCode, setSelectedTaxCode] = useState<string>(
    initialDefaultTaxCodeId ?? ""
  );
  const [taxSaveState, setTaxSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Notification state
  const [preferences, setPreferences] = useState<EmailPreferences>({
    extraction_notifications: true,
    sync_notifications: true,
    marketing_emails: false,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // Fetch tax codes
  useEffect(() => {
    if (!isConnected) {
      setTaxLoading(false);
      return;
    }
    fetch("/api/accounting/tax-codes")
      .then((res) => res.json())
      .then((res) => {
        if (res.data) setTaxCodes(res.data);
      })
      .finally(() => setTaxLoading(false));
  }, [isConnected]);

  // Fetch notification preferences
  useEffect(() => {
    fetch("/api/settings/email-preferences")
      .then((res) => res.json())
      .then((res) => {
        if (res.data) {
          setPreferences({
            extraction_notifications: res.data.extraction_notifications,
            sync_notifications: res.data.sync_notifications,
            marketing_emails: res.data.marketing_emails,
          });
        }
      })
      .finally(() => setNotifLoading(false));
  }, []);

  async function handleTaxCodeChange(value: string) {
    const previousValue = selectedTaxCode;
    setSelectedTaxCode(value);
    setTaxSaveState("saving");

    try {
      const res = await fetch("/api/settings/defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_tax_code_id: value || null }),
      });

      if (res.ok) {
        setTaxSaveState("saved");
        setTimeout(() => setTaxSaveState("idle"), 2000);
      } else {
        setSelectedTaxCode(previousValue);
        setTaxSaveState("idle");
      }
    } catch {
      setSelectedTaxCode(previousValue);
      setTaxSaveState("idle");
    }
  }

  async function togglePreference(key: keyof EmailPreferences) {
    const newValue = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: newValue }));
    setNotifSaving(true);

    try {
      await fetch("/api/settings/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newValue }),
      });
    } catch {
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
    } finally {
      setNotifSaving(false);
    }
  }

  const loading = taxLoading || notifLoading;

  if (loading) {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft overflow-hidden">
        <div className="px-6 py-4 animate-pulse space-y-4">
          <div className="h-4 w-28 rounded bg-gray-100" />
          <div className="h-8 w-full rounded bg-gray-100" />
          <div className="h-8 w-full rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  const showTaxCode = isConnected && taxCodes.length > 0;

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft overflow-hidden">
      {/* Default tax code row */}
      {showTaxCode && (
        <SettingsRow
          title="Default tax code"
          description="Auto-applied to new line items"
        >
          <div className="flex items-center gap-2">
            <select
              value={selectedTaxCode}
              onChange={(e) => handleTaxCodeChange(e.target.value)}
              disabled={taxSaveState === "saving"}
              className="text-[12px] border border-border rounded-md px-3 py-1.5 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 min-w-[180px]"
            >
              <option value="">None</option>
              {taxCodes.map((code) => (
                <option key={code.value} value={code.value}>
                  {code.label}
                  {code.rate !== null ? ` (${code.rate}%)` : ""}
                </option>
              ))}
            </select>
            {taxSaveState === "saving" && (
              <span className="text-xs text-muted">Saving...</span>
            )}
            {taxSaveState === "saved" && (
              <span className="text-xs text-accent">Saved</span>
            )}
          </div>
        </SettingsRow>
      )}

      {/* Notification toggles */}
      <div className={showTaxCode ? "border-t border-gray-50" : ""}>
        <SettingsRow
          title="Extraction notifications"
          description="Get notified when invoice extraction completes"
        >
          <ToggleSwitch
            checked={preferences.extraction_notifications}
            onChange={() => togglePreference("extraction_notifications")}
            disabled={notifSaving}
          />
        </SettingsRow>
      </div>

      <div className="border-t border-gray-50">
        <SettingsRow
          title="Sync notifications"
          description="Get notified when invoices are synced or fail to sync"
        >
          <ToggleSwitch
            checked={preferences.sync_notifications}
            onChange={() => togglePreference("sync_notifications")}
            disabled={notifSaving}
          />
        </SettingsRow>
      </div>

      <div className="border-t border-gray-50">
        <SettingsRow
          title="Product updates"
          description="Receive updates about new features and improvements"
        >
          <ToggleSwitch
            checked={preferences.marketing_emails}
            onChange={() => togglePreference("marketing_emails")}
            disabled={notifSaving}
          />
        </SettingsRow>
      </div>

      {/* Footer note */}
      <div className="border-t border-gray-50 px-6 py-3">
        <p className="text-xs text-muted">
          Billing and security emails cannot be turned off.
        </p>
      </div>
    </div>
  );
}
