import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, authError, validationError, notFound, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { revalidatePath } from "next/cache";

export async function PATCH(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    logger.warn("settings.update_org_name", { error: "Not authenticated" });
    return authError();
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return validationError("Organization name is required.");
  }

  if (name.length > 100) {
    return validationError("Organization name must be 100 characters or fewer.");
  }

  // Look up org from membership — never accept org_id from request body
  const { data: membership, error: membershipErr } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipErr || !membership) {
    logger.warn("settings.update_org_name", { userId: user.id, error: "No org membership found" });
    return notFound("Organization not found.");
  }

  const orgId = membership.org_id;

  // Update via admin client (RLS doesn't cover org table writes from user context)
  const admin = createAdminClient();
  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update({ name })
    .eq("id", orgId)
    .select("name")
    .single();

  if (updateErr || !updated) {
    logger.error("settings.update_org_name", { userId: user.id, orgId, error: updateErr?.message });
    return internalError("Failed to update organization name.");
  }

  revalidatePath("/settings");

  logger.info("settings.update_org_name", {
    userId: user.id,
    orgId,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ name: updated.name });
}
