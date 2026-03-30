import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  apiSuccess,
  internalError,
  conflict,
  validationError,
  unprocessableEntity,
} from "@/lib/utils/errors";
import {
  assignInboundAddress,
  removeInboundAddress,
  setCustomPrefix,
} from "@/lib/email/address";
import { type NextRequest } from "next/server";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

/**
 * GET /api/email/address
 * Returns the org's current inbound email address (or null if not generated).
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return authError();

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) return authError("No organization found");

  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("inbound_email_address")
    .eq("id", orgId)
    .single();

  return apiSuccess({
    address: data?.inbound_email_address ?? null,
  });
}

/**
 * POST /api/email/address
 * Generate a new inbound email address for the org.
 * Idempotent: if one already exists, returns it.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return authError();

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) return authError("No organization found");

  try {
    const address = await assignInboundAddress(orgId);

    logger.info("email_forwarding_enabled", {
      orgId,
      userId: user.id,
      status: "enabled",
    });

    trackServerEvent(user.id, AnalyticsEvents.EMAIL_FORWARDING_ENABLED, {
      orgId,
    });

    return apiSuccess({ address });
  } catch (err) {
    logger.error("email_forwarding_enable_failed", {
      orgId,
      userId: user.id,
      error: err instanceof Error ? err.message : "Unknown error",
      exception: err instanceof Error ? err : undefined,
    });
    return internalError("Failed to enable email forwarding");
  }
}

/**
 * DELETE /api/email/address
 * Remove the org's inbound email address (disable email forwarding).
 */
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return authError();

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) return authError("No organization found");

  try {
    await removeInboundAddress(orgId);

    logger.info("email_forwarding_disabled", {
      orgId,
      userId: user.id,
      status: "disabled",
    });

    trackServerEvent(user.id, AnalyticsEvents.EMAIL_FORWARDING_DISABLED, {
      orgId,
    });

    return apiSuccess({ address: null });
  } catch (err) {
    logger.error("email_forwarding_disable_failed", {
      orgId,
      userId: user.id,
      error: err instanceof Error ? err.message : "Unknown error",
      exception: err instanceof Error ? err : undefined,
    });
    return internalError("Failed to disable email forwarding");
  }
}

/**
 * PUT /api/email/address
 * Set a custom prefix for the org's inbound email address.
 * Body: { prefix: string }
 * Returns the new full address.
 *
 * Requires the org to already have email forwarding enabled.
 * If not enabled, returns 422.
 */
export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return authError();

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) return authError("No organization found");

  // Check that email forwarding is already enabled
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("inbound_email_address")
    .eq("id", orgId)
    .single();

  if (!org?.inbound_email_address) {
    return unprocessableEntity(
      "Enable email forwarding first before customizing your address."
    );
  }

  let body: { prefix?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid request body");
  }

  if (!body.prefix || typeof body.prefix !== "string") {
    return validationError("prefix is required");
  }

  try {
    const result = await setCustomPrefix(orgId, body.prefix);

    if (!result.success) {
      if (result.code === "CONFLICT") {
        return conflict(result.error);
      }
      return validationError(result.error);
    }

    logger.info("email_forwarding_prefix_updated", {
      orgId,
      userId: user.id,
      newAddress: result.address,
      status: "updated",
    });

    trackServerEvent(user.id, AnalyticsEvents.EMAIL_FORWARDING_PREFIX_UPDATED, {
      orgId,
    });

    return apiSuccess({ address: result.address });
  } catch (err) {
    logger.error("email_forwarding_prefix_update_failed", {
      orgId,
      userId: user.id,
      error: err instanceof Error ? err.message : "Unknown error",
      exception: err instanceof Error ? err : undefined,
    });
    return internalError("Failed to update email prefix");
  }
}
