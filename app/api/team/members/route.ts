import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { authError, forbiddenError, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/team/members
 * List org members and pending invites for the current user's active org.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return authError();

    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) return forbiddenError("No organization found.");

    const adminSupabase = createAdminClient();

    // Get members with their user info
    const { data: memberships, error: membershipsError } = await adminSupabase
      .from("org_memberships")
      .select("id, user_id, role, created_at, users(email)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (membershipsError) {
      logger.error("team_members_list_failed", {
        orgId,
        error: membershipsError.message,
      });
      return internalError("Failed to load team members.");
    }

    const members = (memberships ?? []).map((m) => {
      const u = m.users as unknown as { email: string };
      return {
        userId: m.user_id,
        email: u?.email ?? "",
        role: m.role,
        joinedAt: m.created_at,
      };
    });

    // Get pending invites
    const { data: invites } = await adminSupabase
      .from("org_invites")
      .select("id, invited_email, role, expires_at, created_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    const pendingInvites = (invites ?? []).map((inv) => ({
      inviteId: inv.id,
      email: inv.invited_email,
      role: inv.role,
      expiresAt: inv.expires_at,
      sentAt: inv.created_at,
    }));

    return apiSuccess({ members, pendingInvites });
  } catch (err) {
    logger.error("team_members_error", { error: String(err) });
    return internalError();
  }
}
