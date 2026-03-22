import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/settings/email-preferences
 * Returns the user's email preferences. Creates a default row if none exists.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  const admin = createAdminClient();

  // Try to fetch existing preferences
  const { data: existing } = await admin
    .from("email_preferences")
    .select(
      "extraction_notifications, sync_notifications, billing_notifications, marketing_emails"
    )
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return apiSuccess(existing);
  }

  // Create default row
  const defaults = {
    user_id: user.id,
    extraction_notifications: true,
    sync_notifications: true,
    billing_notifications: true,
    marketing_emails: false,
  };

  const { data: created, error } = await admin
    .from("email_preferences")
    .insert(defaults)
    .select(
      "extraction_notifications, sync_notifications, billing_notifications, marketing_emails"
    )
    .single();

  if (error) {
    logger.error("email_preferences_create_failed", {
      userId: user.id,
      error: error.message,
    });
    return internalError("Failed to create email preferences.");
  }

  return apiSuccess(created);
}

/**
 * PATCH /api/settings/email-preferences
 * Updates one or more email preference fields.
 */
export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  const body = await request.json();

  // Only allow updating specific fields
  const allowedFields = [
    "extraction_notifications",
    "sync_notifications",
    "marketing_emails",
  ] as const;

  const updates: Record<string, boolean> = {};
  for (const field of allowedFields) {
    if (typeof body[field] === "boolean") {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiSuccess({ message: "No valid fields to update." });
  }

  updates.updated_at = new Date().toISOString() as unknown as boolean;

  const admin = createAdminClient();

  // Upsert: create row if it doesn't exist, update if it does
  const { error } = await admin
    .from("email_preferences")
    .upsert(
      {
        user_id: user.id,
        ...updates,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    logger.error("email_preferences_update_failed", {
      userId: user.id,
      error: error.message,
    });
    return internalError("Failed to update email preferences.");
  }

  logger.info("email_preferences_updated", {
    userId: user.id,
    fields: Object.keys(updates).filter((k) => k !== "updated_at"),
  });

  return apiSuccess({ updated: true });
}
