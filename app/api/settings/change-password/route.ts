import { createClient } from "@/lib/supabase/server";
import { apiSuccess, authError, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    logger.warn("settings.change_password", { error: "Not authenticated" });
    return authError();
  }

  const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://localhost:3000";

  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
    user.email!,
    { redirectTo: `${origin}/settings` }
  );

  if (resetErr) {
    logger.error("settings.change_password", {
      userId: user.id,
      error: resetErr.message,
      durationMs: Date.now() - start,
    });
    return internalError("Failed to send password reset email.");
  }

  logger.info("settings.change_password", {
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ message: "Password reset email sent." });
}
