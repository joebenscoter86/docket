import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { apiSuccess, authError, validationError, notFound, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { revalidatePath } from "next/cache";

const VALID_OUTPUT_TYPES = ["bill", "check", "cash", "credit_card"] as const;

export async function PATCH(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    logger.warn("settings.update_org", { error: "Not authenticated" });
    return authError();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  // Build update payload — each field is independently optional
  const update: Record<string, unknown> = {};

  // Name field
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return validationError("Organization name is required.");
    }
    if (name.length > 100) {
      return validationError("Organization name must be 100 characters or fewer.");
    }
    update.name = name;
  }

  // Default output type
  if ("default_output_type" in body) {
    const outputType = body.default_output_type as string;
    if (!VALID_OUTPUT_TYPES.includes(outputType as typeof VALID_OUTPUT_TYPES[number])) {
      return validationError(
        `Invalid default_output_type. Must be one of: ${VALID_OUTPUT_TYPES.join(", ")}`
      );
    }
    update.default_output_type = outputType;
  }

  // Default payment account
  if ("default_payment_account_id" in body) {
    update.default_payment_account_id = body.default_payment_account_id ?? null;
  }
  if ("default_payment_account_name" in body) {
    update.default_payment_account_name = body.default_payment_account_name ?? null;
  }

  if (Object.keys(update).length === 0) {
    return validationError("No valid fields to update.");
  }

  // Look up org — never accept org_id from request body
  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    logger.warn("settings.update_org", { userId: user.id, error: "No org found" });
    return notFound("Organization not found.");
  }

  // Update via admin client (RLS doesn't cover org table writes from user context)
  const admin = createAdminClient();
  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update(update)
    .eq("id", orgId)
    .select("name, default_output_type, default_payment_account_id, default_payment_account_name")
    .single();

  if (updateErr || !updated) {
    logger.error("settings.update_org", { userId: user.id, orgId, error: updateErr?.message });
    return internalError("Failed to update organization.");
  }

  revalidatePath("/settings");

  logger.info("settings.update_org", {
    userId: user.id,
    orgId,
    fields: Object.keys(update).join(","),
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess(updated);
}
