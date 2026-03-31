"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type InviteStatus = "loading" | "pending" | "expired" | "accepted" | "invalid" | "mismatch";

interface InviteData {
  orgName: string;
  inviterEmail: string;
  inviterName: string | null;
  invitedEmail: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<InviteStatus>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
      setCurrentUserEmail(user?.email ?? null);
    }
    checkAuth();
  }, []);

  useEffect(() => {
    async function validateInvite() {
      try {
        const res = await fetch(`/api/team/invite/${token}`);
        const body = await res.json();

        if (!res.ok) {
          setStatus("invalid");
          return;
        }

        const data = body.data;
        if (data.status === "expired") {
          setStatus("expired");
          setInvite({ orgName: data.orgName, inviterEmail: "", inviterName: null, invitedEmail: "", expiresAt: "" });
          return;
        }
        if (data.status === "accepted") {
          setStatus("accepted");
          setInvite({ orgName: data.orgName, inviterEmail: "", inviterName: null, invitedEmail: "", expiresAt: "" });
          return;
        }

        setInvite({
          orgName: data.orgName,
          inviterEmail: data.inviterEmail,
          inviterName: data.inviterName ?? null,
          invitedEmail: data.invitedEmail,
          expiresAt: data.expiresAt,
        });
        setStatus("pending");
      } catch {
        setStatus("invalid");
      }
    }
    validateInvite();
  }, [token]);

  useEffect(() => {
    if (
      status === "pending" &&
      isLoggedIn &&
      currentUserEmail &&
      invite?.invitedEmail &&
      currentUserEmail.toLowerCase() !== invite.invitedEmail.toLowerCase()
    ) {
      setStatus("mismatch");
    }
  }, [status, isLoggedIn, currentUserEmail, invite]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/team/invite/${token}/accept`, {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to accept invite.");
        setAccepting(false);
        return;
      }

      router.push(body.data.redirectTo || "/invoices");
    } catch {
      setError("Failed to accept invite. Please try again.");
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-float sm:p-10">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/dockett_logo.png"
              alt="Dockett logo"
              width={180}
              height={180}
              sizes="180px"
              priority
            />
          </div>

          {/* Loading state */}
          {status === "loading" && (
            <div className="text-center">
              <div className="animate-pulse space-y-3">
                <div className="h-6 bg-gray-200 rounded w-2/3 mx-auto" />
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-10 bg-gray-100 rounded w-full mt-6" />
              </div>
            </div>
          )}

          {/* Invalid invite */}
          {status === "invalid" && (
            <div className="text-center">
              <h1 className="font-headings text-xl font-bold text-text mb-3">
                Invalid Invite
              </h1>
              <p className="text-sm text-muted mb-6">
                This invite link is not valid. It may have been revoked or the
                URL may be incorrect.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md hover:from-blue-600 hover:to-blue-700"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Expired invite */}
          {status === "expired" && invite && (
            <div className="text-center">
              <h1 className="font-headings text-xl font-bold text-text mb-3">
                Invite Expired
              </h1>
              <p className="text-sm text-muted mb-6">
                This invite to join <strong>{invite.orgName}</strong> has
                expired. Ask the organization owner to send a new one.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md hover:from-blue-600 hover:to-blue-700"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Already accepted */}
          {status === "accepted" && invite && (
            <div className="text-center">
              <h1 className="font-headings text-xl font-bold text-text mb-3">
                Already Accepted
              </h1>
              <p className="text-sm text-muted mb-6">
                This invite to join <strong>{invite.orgName}</strong> has
                already been accepted.
              </p>
              <Link
                href="/invoices"
                className="inline-flex items-center justify-center w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md hover:from-blue-600 hover:to-blue-700"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* Email mismatch -- logged in as wrong account */}
          {status === "mismatch" && invite && (
            <div className="text-center">
              <h1 className="font-headings text-xl font-bold text-text mb-3">
                Wrong Account
              </h1>
              <p className="text-sm text-muted mb-2">
                You&apos;re signed in as <strong>{currentUserEmail}</strong>, but
                this invite was sent to <strong>{invite.invitedEmail}</strong>.
              </p>
              <p className="text-sm text-muted mb-6">
                Sign in or create an account with that email to accept.
              </p>

              <div className="space-y-3">
                <button
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    router.push(`/login?redirect=/invite/${token}`);
                  }}
                  className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
                >
                  Switch Account
                </button>
                <button
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    router.push(`/signup?redirect=/invite/${token}`);
                  }}
                  className="block w-full rounded-2xl border border-border px-4 py-3.5 text-center text-base font-semibold text-text transition-all hover:bg-gray-50"
                >
                  Create Account
                </button>
              </div>
            </div>
          )}

          {/* Valid pending invite */}
          {status === "pending" && invite && (
            <div className="text-center">
              <h1 className="font-headings text-xl font-bold text-text mb-3">
                You&apos;re Invited
              </h1>
              <p className="text-sm text-muted mb-6">
                <strong>{invite.inviterName || invite.inviterEmail}</strong> invited you to join{" "}
                <strong>{invite.orgName}</strong> on Dockett.
              </p>

              {error && (
                <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error mb-4">
                  {error}
                </div>
              )}

              {isLoggedIn ? (
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {accepting ? "Joining..." : "Accept Invite"}
                </button>
              ) : (
                <div className="space-y-3">
                  <Link
                    href={`/login?redirect=/invite/${token}`}
                    className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
                  >
                    Log In to Accept
                  </Link>
                  <Link
                    href={`/signup?redirect=/invite/${token}`}
                    className="block w-full rounded-2xl border border-border px-4 py-3.5 text-center text-base font-semibold text-text transition-all hover:bg-gray-50"
                  >
                    Create an Account
                  </Link>
                </div>
              )}

              <p className="text-xs text-muted mt-4">
                This invite was sent to {invite.invitedEmail}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
