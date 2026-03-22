import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validationError, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

const MAX_DESIGN_PARTNERS = 10;

export async function POST(request: NextRequest) {
  const start = Date.now();

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid request body");
  }

  const code = body.code?.trim();
  if (!code) {
    return validationError("Invite code is required");
  }

  const expectedCode = process.env.DESIGN_PARTNER_CODE;
  if (!expectedCode) {
    logger.error("validate-invite-code", {
      status: "error",
      error: "DESIGN_PARTNER_CODE env var not configured",
    });
    return internalError("Invite code validation is not available");
  }

  if (code !== expectedCode) {
    logger.info("validate-invite-code", {
      status: "invalid_code",
      durationMs: Date.now() - start,
    });
    return validationError("Invalid invite code");
  }

  // Check how many design partners already exist
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("is_design_partner", true);

    if (error) {
      logger.error("validate-invite-code", {
        status: "error",
        error: error.message,
        durationMs: Date.now() - start,
      });
      return internalError("Unable to validate invite code");
    }

    if ((count ?? 0) >= MAX_DESIGN_PARTNERS) {
      logger.info("validate-invite-code", {
        status: "cap_reached",
        count,
        durationMs: Date.now() - start,
      });
      return validationError("All design partner spots have been claimed");
    }

    logger.info("validate-invite-code", {
      status: "valid",
      currentPartners: count,
      durationMs: Date.now() - start,
    });

    return apiSuccess({ valid: true });
  } catch (err) {
    logger.error("validate-invite-code", {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      exception: err instanceof Error ? err : undefined,
      durationMs: Date.now() - start,
    });
    return internalError("Unable to validate invite code");
  }
}
