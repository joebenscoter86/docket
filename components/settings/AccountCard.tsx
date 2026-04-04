"use client";

import { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { SettingsRow } from "@/components/settings/SettingsRow";

interface AccountCardProps {
  email: string;
  orgName: string;
  orgId: string;
}

export function AccountCard({ email, orgName, orgId }: AccountCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordSending, setPasswordSending] = useState(false);
  const [passwordSent, setPasswordSent] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Organization name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Organization name must be 100 characters or fewer.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to update organization name.");
        return;
      }

      setName(body.data.name);
      setEditing(false);
      setSaved(true);
    } catch {
      setError("Failed to update organization name.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(orgName);
    setEditing(false);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  async function handleChangePassword() {
    setPasswordSending(true);
    setPasswordError(null);

    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        setPasswordError(body.error || "Failed to send reset email.");
        return;
      }

      setPasswordSent(true);
    } catch {
      setPasswordError("Failed to send reset email.");
    } finally {
      setPasswordSending(false);
    }
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft overflow-hidden">
      {/* Email row */}
      <SettingsRow title="Email" description="Your login email address">
        <span className="text-[13px] text-text">{email}</span>
      </SettingsRow>

      {/* Organization row */}
      <div className="border-t border-gray-50">
        {editing ? (
          <div className="px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-6">
              <div className="min-w-0 sm:max-w-[48%]">
                <p className="text-[13px] font-semibold text-text">Organization</p>
                <p className="text-[12px] text-muted mt-0.5">Your business name</p>
              </div>
              <div className="flex-1 sm:max-w-[48%]">
                <Input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={100}
                  error={!!error}
                  disabled={saving}
                />
                {error && (
                  <p className="text-sm text-error mt-1.5">{error}</p>
                )}
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={saving}
                    className="h-9 px-3 text-[13px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-9 px-3 text-[13px]"
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <SettingsRow title="Organization" description="Your business name">
            <span className="text-[13px] text-text">{name || "\u2014"}</span>
            {saved && (
              <span className="text-accent text-[13px] font-medium">Saved</span>
            )}
            {orgId && (
              <button
                onClick={() => setEditing(true)}
                className="text-[12px] text-primary hover:underline"
              >
                Edit
              </button>
            )}
          </SettingsRow>
        )}
      </div>

      {/* Password row */}
      <div className="border-t border-gray-50">
        <SettingsRow title="Password" description="Send a reset link to your email">
          {passwordSent ? (
            <span className="text-sm text-accent">Reset email sent</span>
          ) : (
            <>
              <button
                onClick={handleChangePassword}
                disabled={passwordSending}
                className="text-[12px] text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordSending ? "Sending..." : "Change password"}
              </button>
              {passwordError && (
                <span className="text-sm text-error">{passwordError}</span>
              )}
            </>
          )}
        </SettingsRow>
      </div>
    </div>
  );
}
