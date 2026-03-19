"use client";

import { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
      <div className="space-y-4">
        {/* Email (read-only) */}
        <div>
          <label className="text-sm font-medium text-muted block mb-1.5">
            Email
          </label>
          <div className="bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text">
            {email}
          </div>
        </div>

        {/* Organization (inline edit) */}
        <div>
          <label className="text-sm font-medium text-muted block mb-1.5">
            Organization
          </label>
          {editing ? (
            <div>
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
          ) : (
            <div
              className={`bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text flex items-center justify-between${orgId ? " cursor-pointer group hover:border hover:border-primary/30" : ""}`}
              onClick={orgId ? () => setEditing(true) : undefined}
              role={orgId ? "button" : undefined}
              tabIndex={orgId ? 0 : undefined}
              onKeyDown={orgId ? (e) => { if (e.key === "Enter") setEditing(true); } : undefined}
            >
              <span>{name || "\u2014"}</span>
              {orgId && (
                <svg className="h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              )}
              {saved && (
                <span className="text-accent text-[13px] font-medium">Saved</span>
              )}
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="pt-1">
          {passwordSent ? (
            <p className="text-sm text-accent">
              Password reset email sent to {email}.
            </p>
          ) : (
            <>
              <button
                onClick={handleChangePassword}
                disabled={passwordSending}
                className="text-sm text-primary hover:text-primary-hover underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordSending ? "Sending..." : "Change password"}
              </button>
              {passwordError && (
                <p className="text-sm text-error mt-1">{passwordError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
