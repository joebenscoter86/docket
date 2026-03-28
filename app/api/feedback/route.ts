import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";
import { getResend } from "@/lib/email/resend";

const FEEDBACK_RECIPIENT = "joe@dockett.app";
const MAX_MESSAGE_LENGTH = 5000;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    let body: { message?: string; type?: string };
    try {
      body = await request.json();
    } catch {
      return validationError("Invalid JSON body.");
    }

    const message = body.message?.trim();
    const type = body.type === "bug" ? "Bug Report" : "Feature Request";

    if (!message || message.length === 0) {
      return validationError("Message is required.");
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return validationError(`Message must be under ${MAX_MESSAGE_LENGTH} characters.`);
    }

    // Send via Resend as plain text (no React template needed for internal feedback)
    const { error: sendError } = await getResend().emails.send({
      from: "Dockett Feedback <no-reply@dockett.app>",
      to: FEEDBACK_RECIPIENT,
      replyTo: user.email || undefined,
      subject: `[${type}] Feedback from ${user.email}`,
      text: [
        `Type: ${type}`,
        `From: ${user.email}`,
        `User ID: ${user.id}`,
        `Date: ${new Date().toISOString()}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    });

    if (sendError) {
      logger.error("feedback.send_failed", {
        userId: user.id,
        error: sendError.message,
      });
      return internalError("Failed to send feedback. Please try again.");
    }

    logger.info("feedback.sent", {
      action: "send_feedback",
      userId: user.id,
      type,
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ sent: true });
  } catch (error) {
    logger.error("feedback.unexpected_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
