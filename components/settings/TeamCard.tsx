"use client";

import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface Member {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface PendingInvite {
  inviteId: string;
  email: string;
  role: string;
  expiresAt: string;
  sentAt: string;
}

interface TeamCardProps {
  isOwner: boolean;
}

export function TeamCard({ isOwner }: TeamCardProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeam();
  }, []);

  useEffect(() => {
    if (!inviteSuccess) return;
    const timer = setTimeout(() => setInviteSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [inviteSuccess]);

  async function fetchTeam() {
    try {
      const res = await fetch("/api/team/members");
      const body = await res.json();
      if (res.ok && body.data) {
        setMembers(body.data.members);
        setPendingInvites(body.data.pendingInvites);
      }
    } catch {
      // Silently fail on load
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    setInviting(true);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();

      if (!res.ok) {
        setInviteError(body.error || "Failed to send invite.");
        return;
      }

      setInviteEmail("");
      setInviteSuccess(`Invite sent to ${email}`);
      fetchTeam();
    } catch {
      setInviteError("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      }
    } catch {
      // Silently fail
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setRevokingId(inviteId);
    try {
      const res = await fetch(`/api/team/invite?id=${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPendingInvites((prev) =>
          prev.filter((inv) => inv.inviteId !== inviteId)
        );
      }
    } catch {
      // Silently fail
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
      <div className="space-y-5">
        {/* Members list */}
        <div>
          <label className="text-sm font-medium text-muted block mb-2">
            Members
          </label>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between bg-background rounded-brand-md px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[14px] text-text truncate">
                    {member.email}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      member.role === "owner"
                        ? "bg-primary/10 text-primary"
                        : "bg-gray-100 text-muted"
                    }`}
                  >
                    {member.role === "owner" ? "Owner" : "Member"}
                  </span>
                </div>
                {isOwner && member.role !== "owner" && (
                  <button
                    onClick={() => handleRemoveMember(member.userId)}
                    disabled={removingId === member.userId}
                    className="text-[13px] text-muted hover:text-error transition-colors disabled:opacity-50 flex-shrink-0 ml-2"
                  >
                    {removingId === member.userId ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div>
            <label className="text-sm font-medium text-muted block mb-2">
              Pending Invites
            </label>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.inviteId}
                  className="flex items-center justify-between bg-background rounded-brand-md px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[14px] text-text truncate">
                      {invite.email}
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-600">
                      Pending
                    </span>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRevokeInvite(invite.inviteId)}
                      disabled={revokingId === invite.inviteId}
                      className="text-[13px] text-muted hover:text-error transition-colors disabled:opacity-50 flex-shrink-0 ml-2"
                    >
                      {revokingId === invite.inviteId ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite form (owner only) */}
        {isOwner && (
          <div className="pt-1">
            <label className="text-sm font-medium text-muted block mb-2">
              Invite a team member
            </label>
            <form onSubmit={handleInvite} className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={inviting || !inviteEmail.trim()}
                className="h-[42px] px-4 text-[13px] flex-shrink-0"
              >
                {inviting ? "Sending..." : "Send Invite"}
              </Button>
            </form>
            {inviteError && (
              <p className="text-sm text-error mt-1.5">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="text-sm text-accent mt-1.5">{inviteSuccess}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
