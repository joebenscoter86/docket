import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import {
  apiSuccess,
  authError,
  internalError,
  validationError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/settings/defaults
 * Returns the org's default_tax_code_id from accounting_connections.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    return apiSuccess({ default_tax_code_id: null });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounting_connections")
    .select("default_tax_code_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    logger.error("settings.defaults.get", {
      userId: user.id,
      orgId,
      error: error.message,
    });
    return internalError("Failed to fetch default settings.");
  }

  return apiSuccess({ default_tax_code_id: data?.default_tax_code_id ?? null });
}

/**
 * PATCH /api/settings/defaults
 * Updates the org's default_tax_code_id.
 * Body: { "default_tax_code_id": "3" } or { "default_tax_code_id": null }
 */
export async function PATCH(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  if (!("default_tax_code_id" in body)) {
    return validationError("default_tax_code_id is required.");
  }

  const taxCodeId = body.default_tax_code_id;
  if (taxCodeId !== null && typeof taxCodeId !== "string") {
    return validationError("default_tax_code_id must be a string or null.");
  }

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    return validationError("No active organization found.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("accounting_connections")
    .update({ default_tax_code_id: taxCodeId })
    .eq("org_id", orgId);

  if (error) {
    logger.error("settings.defaults.patch", {
      userId: user.id,
      orgId,
      error: error.message,
    });
    return internalError("Failed to update default settings.");
  }

  logger.info("settings.defaults.patch", {
    userId: user.id,
    orgId,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ updated: true });
}
