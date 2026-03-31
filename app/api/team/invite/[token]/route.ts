import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, apiSuccess, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/team/invite/[token]
 * Validate an invite token and return invite details.
 * No auth required -- the invite page needs to show info before login.
 */
export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const adminSupabase = createAdminClient();

    const { data: invite, error } = await adminSupabase
      .from("org_invites")
      .select("id, org_id, invited_email, expires_at, accepted_at, organizations(name), users!org_invites_invited_by_fkey(email, full_name)")
      .eq("token", params.token)
      .single();

    if (error || !invite) {
      return notFound("This invite link is invalid.");
    }

    const now = new Date();
    const expiresAt = new Date(invite.expires_at);

    if (invite.accepted_at) {
      return apiSuccess({
        status: "accepted",
        orgName: (invite.organizations as unknown as { name: string })?.name ?? "",
      });
    }

    if (expiresAt < now) {
      return apiSuccess({
        status: "expired",
        orgName: (invite.organizations as unknown as { name: string })?.name ?? "",
      });
    }

    const inviterData = invite.users as unknown as { email: string; full_name: string | null };

    return apiSuccess({
      status: "pending",
      inviteId: invite.id,
      orgName: (invite.organizations as unknown as { name: string })?.name ?? "",
      invitedEmail: invite.invited_email,
      inviterEmail: inviterData?.email ?? "",
      inviterName: inviterData?.full_name ?? null,
      expiresAt: invite.expires_at,
    });
  } catch (err) {
    logger.error("team_invite_validate_error", {
      token: params.token,
      error: String(err),
    });
    return internalError();
  }
}
