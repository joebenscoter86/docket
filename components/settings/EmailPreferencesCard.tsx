"use client";

import { useState, useEffect } from "react";

interface EmailPreferences {
  extraction_notifications: boolean;
  sync_notifications: boolean;
  marketing_emails: boolean;
}

export function EmailPreferencesCard() {
  const [preferences, setPreferences] = useState<EmailPreferences>({
    extraction_notifications: true,
    sync_notifications: true,
    marketing_emails: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      .finally(() => setLoading(false));
  }, []);

  async function togglePreference(key: keyof EmailPreferences) {
    const newValue = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: newValue }));
    setSaving(true);

    try {
      await fetch("/api/settings/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newValue }),
      });
    } catch {
      // Revert on failure
      setPreferences((prev) => ({ ...prev, [key]: !newValue }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-gray-100" />
          <div className="h-10 rounded bg-gray-100" />
          <div className="h-10 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="space-y-4">
        <Toggle
          label="Extraction notifications"
          description="Get notified when invoice extraction completes"
          checked={preferences.extraction_notifications}
          onChange={() => togglePreference("extraction_notifications")}
          disabled={saving}
        />
        <Toggle
          label="Sync notifications"
          description="Get notified when invoices are synced or fail to sync"
          checked={preferences.sync_notifications}
          onChange={() => togglePreference("sync_notifications")}
          disabled={saving}
        />
        <Toggle
          label="Product updates"
          description="Receive updates about new features and improvements"
          checked={preferences.marketing_emails}
          onChange={() => togglePreference("marketing_emails")}
          disabled={saving}
        />
        <p className="text-xs text-muted pt-1">
          Billing and security emails cannot be turned off.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
