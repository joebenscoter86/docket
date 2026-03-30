import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgWithRole } from "@/lib/supabase/helpers";
import {
  authError,
  forbiddenError,
  validationError,
  notFound,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * DELETE /api/team/members/[userId]
 * Remove a member from the organization. Owner only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return authError();

    const orgWithRole = await getActiveOrgWithRole(supabase, user.id);
    if (!orgWithRole) return forbiddenError("No organization found.");
    if (orgWithRole.role !== "owner") {
      return forbiddenError("Only the organization owner can remove members.");
    }

    // Cannot remove yourself
    if (params.userId === user.id) {
      return validationError("You cannot remove yourself from the organization.");
    }

    const adminSupabase = createAdminClient();

    // Verify the target user is actually a member of this org
    const { data: membership } = await adminSupabase
      .from("org_memberships")
      .select("id, role")
      .eq("user_id", params.userId)
      .eq("org_id", orgWithRole.orgId)
      .single();

    if (!membership) {
      return notFound("This user is not a member of your organization.");
    }

    // Don't allow removing another owner (safety check)
    if (membership.role === "owner") {
      return validationError("Cannot remove an organization owner.");
    }

    // Remove the membership
    const { error: deleteError } = await adminSupabase
      .from("org_memberships")
      .delete()
      .eq("id", membership.id);

    if (deleteError) {
      logger.error("team_member_remove_failed", {
        orgId: orgWithRole.orgId,
        targetUserId: params.userId,
        error: deleteError.message,
      });
      return internalError("Failed to remove team member.");
    }

    // If the removed user's active_org_id was this org, switch them to their personal org
    const { data: removedUser } = await adminSupabase
      .from("users")
      .select("active_org_id")
      .eq("id", params.userId)
      .single();

    if (removedUser?.active_org_id === orgWithRole.orgId) {
      // Find their personal org (one where they're owner)
      const { data: ownedOrg } = await adminSupabase
        .from("org_memberships")
        .select("org_id")
        .eq("user_id", params.userId)
        .eq("role", "owner")
        .limit(1)
        .single();

      if (ownedOrg) {
        await adminSupabase
          .from("users")
          .update({ active_org_id: ownedOrg.org_id })
          .eq("id", params.userId);
      }
    }

    logger.info("team_member_removed", {
      orgId: orgWithRole.orgId,
      removedUserId: params.userId,
      removedBy: user.id,
    });

    return apiSuccess({ removed: true });
  } catch (err) {
    logger.error("team_member_remove_error", { error: String(err) });
    return internalError();
  }
}
