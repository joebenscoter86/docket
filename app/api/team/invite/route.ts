import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgWithRole } from "@/lib/supabase/helpers";
import { sendTeamInviteEmail } from "@/lib/email/triggers";
import {
  authError,
  forbiddenError,
  validationError,
  notFound,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return authError();

    // Owner-only
    const orgWithRole = await getActiveOrgWithRole(supabase, user.id);
    if (!orgWithRole) return forbiddenError("No organization found.");
    if (orgWithRole.role !== "owner") {
      return forbiddenError("Only the organization owner can invite team members.");
    }

    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return validationError("Please enter a valid email address.");
    }

    const adminSupabase = createAdminClient();

    // Check if already a member
    const { data: existingMembers } = await adminSupabase
      .from("org_memberships")
      .select("user_id, users!inner(email)")
      .eq("org_id", orgWithRole.orgId);

    const alreadyMember = existingMembers?.some(
      (m) => {
        const u = m.users as unknown as { email: string };
        return u.email?.toLowerCase() === email;
      }
    );

    if (alreadyMember) {
      return conflict("This person is already a member of your organization.");
    }

    // Insert invite (unique partial index prevents duplicate pending invites)
    const { data: invite, error: insertError } = await adminSupabase
      .from("org_invites")
      .insert({
        org_id: orgWithRole.orgId,
        invited_email: email,
        invited_by: user.id,
      })
      .select("id, token, expires_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return conflict("An invite has already been sent to this email address.");
      }
      logger.error("team_invite_insert_failed", {
        orgId: orgWithRole.orgId,
        userId: user.id,
        error: insertError.message,
      });
      return internalError("Failed to create invite.");
    }

    // Get org name for the email
    const { data: org } = await adminSupabase
      .from("organizations")
      .select("name")
      .eq("id", orgWithRole.orgId)
      .single();

    const { data: inviterUser } = await adminSupabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .single();

    // Send invite email (fire-and-forget pattern)
    sendTeamInviteEmail(
      user.email!,
      email,
      org?.name ?? "your organization",
      invite.token,
      invite.expires_at,
      inviterUser?.full_name ?? null
    ).catch((err) => {
      logger.error("team_invite_email_failed", {
        inviteId: invite.id,
        error: String(err),
      });
    });

    logger.info("team_invite_created", {
      orgId: orgWithRole.orgId,
      userId: user.id,
      invitedEmail: email,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({ id: invite.id, email, expiresAt: invite.expires_at });
  } catch (err) {
    logger.error("team_invite_error", { error: String(err) });
    return internalError();
  }
}

/**
 * DELETE /api/team/invite?id=[inviteId]
 * Revoke a pending invite. Owner only.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return authError();

    const orgWithRole = await getActiveOrgWithRole(supabase, user.id);
    if (!orgWithRole) return forbiddenError("No organization found.");
    if (orgWithRole.role !== "owner") {
      return forbiddenError("Only the organization owner can revoke invites.");
    }

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("id");
    if (!inviteId) return validationError("Missing invite ID.");

    const adminSupabase = createAdminClient();

    const { data: invite } = await adminSupabase
      .from("org_invites")
      .select("id, org_id, accepted_at")
      .eq("id", inviteId)
      .single();

    if (!invite || invite.org_id !== orgWithRole.orgId) {
      return notFound("Invite not found.");
    }

    if (invite.accepted_at) {
      return notFound("This invite has already been accepted.");
    }

    const { error: deleteError } = await adminSupabase
      .from("org_invites")
      .delete()
      .eq("id", invite.id);

    if (deleteError) {
      logger.error("team_invite_revoke_failed", {
        inviteId: invite.id,
        error: deleteError.message,
      });
      return internalError("Failed to revoke invite.");
    }

    logger.info("team_invite_revoked", {
      orgId: orgWithRole.orgId,
      inviteId: invite.id,
      revokedBy: user.id,
    });

    return apiSuccess({ revoked: true });
  } catch (err) {
    logger.error("team_invite_revoke_error", { error: String(err) });
    return internalError();
  }
}
