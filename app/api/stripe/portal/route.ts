import { createClient } from "@/lib/supabase/server";
import { createBillingPortalUrl } from "@/lib/stripe/helpers";
import {
  authError,
  validationError,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const start = Date.now();

  // 1. Auth
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return authError();
  }

  logger.info("stripe_portal.start", { userId: user.id });

  try {
    // 2. Fetch stripe_customer_id
    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (userErr || !userData) {
      return internalError("Failed to fetch user data");
    }

    if (!userData.stripe_customer_id) {
      return validationError("No billing account found.");
    }

    // 3. Create portal session
    const origin = new URL(request.url).origin;
    const portalUrl = await createBillingPortalUrl(
      userData.stripe_customer_id,
      `${origin}/app/settings`
    );

    logger.info("stripe_portal.success", {
      userId: user.id,
      status: "success",
      durationMs: Date.now() - start,
    });

    return apiSuccess({ portalUrl });
  } catch (err) {
    logger.error("stripe_portal.error", {
      userId: user.id,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - start,
    });
    return internalError("Failed to create billing portal session");
  }
}
