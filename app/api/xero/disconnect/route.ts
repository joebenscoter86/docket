import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { disconnect } from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * POST /api/xero/disconnect
 *
 * Disconnects Xero: revokes tokens (best-effort) and deletes the connection row.
 */
export async function POST() {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) {
      return authError("No organization found.");
    }

    const adminSupabase = createAdminClient();
    await disconnect(adminSupabase, orgId);

    logger.info("xero.disconnect_requested", {
      userId: user.id,
      orgId,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({ disconnected: true });
  } catch (error) {
    logger.error("xero.disconnect_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to disconnect Xero.");
  }
}
