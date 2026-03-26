import { getResend } from "./resend";
import { logger } from "@/lib/utils/logger";
import type { ReactElement } from "react";

interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
  from?: string;
  replyTo?: string;
}

const DEFAULT_FROM = "Dockett <no-reply@dockett.app>";
const DEFAULT_REPLY_TO = "support@dockett.app";

/**
 * Fire-and-forget email send. Failures are logged but never thrown.
 * Call without await to avoid blocking the parent operation.
 */
export async function sendEmail({
  to,
  subject,
  react,
  from = DEFAULT_FROM,
  replyTo = DEFAULT_REPLY_TO,
}: SendEmailOptions): Promise<void> {
  try {
    const { data, error } = await getResend().emails.send({
      from,
      to,
      subject,
      replyTo,
      react,
    });
    if (error) {
      logger.error("email_send_failed", {
        to,
        subject,
        error: error.message,
      });
    } else {
      logger.info("email_sent", { to, subject, resendId: data?.id });
    }
  } catch (err) {
    logger.error("email_send_error", {
      to,
      subject,
      error: String(err),
    });
  }
}
