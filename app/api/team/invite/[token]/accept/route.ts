import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authError,
  forbiddenError,
  notFound,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/team/invite/[token]/accept
 * Accept an invite -- creates org membership and switches active org.
 */
export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return authError();

    const adminSupabase = createAdminClient();

    // Look up invite
    const { data: invite, error: inviteError } = await adminSupabase
      .from("org_invites")
      .select("id, org_id, invited_email, expires_at, accepted_at, role")
      .eq("token", params.token)
      .single();

    if (inviteError || !invite) {
      return notFound("This invite link is invalid.");
    }

    // Check if already accepted
    if (invite.accepted_at) {
      // If this user is already a member, just switch their active org
      const { data: existingMembership } = await adminSupabase
        .from("org_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("org_id", invite.org_id)
        .single();

      if (existingMembership) {
        await adminSupabase
          .from("users")
          .update({ active_org_id: invite.org_id })
          .eq("id", user.id);

        return apiSuccess({ redirectTo: "/invoices" });
      }

      return conflict("This invite has already been accepted.");
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invite has expired. Ask the organization owner to send a new one.", code: "NOT_FOUND" },
        { status: 410 }
      );
    }

    // Verify email matches
    if (user.email?.toLowerCase() !== invite.invited_email.toLowerCase()) {
      return forbiddenError(
        `This invite was sent to ${invite.invited_email}. Please log in with that email address.`
      );
    }

    // Check if already a member (accept gracefully)
    const { data: existingMembership } = await adminSupabase
      .from("org_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", invite.org_id)
      .single();

    if (!existingMembership) {
      // Create membership
      const { error: membershipError } = await adminSupabase
        .from("org_memberships")
        .insert({
          user_id: user.id,
          org_id: invite.org_id,
          role: invite.role,
        });

      if (membershipError) {
        logger.error("team_invite_accept_membership_failed", {
          userId: user.id,
          orgId: invite.org_id,
          error: membershipError.message,
        });
        return internalError("Failed to join organization.");
      }
    }

    // Mark invite as accepted
    await adminSupabase
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    // Switch user's active org
    await adminSupabase
      .from("users")
      .update({ active_org_id: invite.org_id })
      .eq("id", user.id);

    logger.info("team_invite_accepted", {
      userId: user.id,
      orgId: invite.org_id,
      inviteId: invite.id,
    });

    return apiSuccess({ redirectTo: "/invoices" });
  } catch (err) {
    logger.error("team_invite_accept_error", {
      token: params.token,
      error: String(err),
    });
    return internalError();
  }
}
