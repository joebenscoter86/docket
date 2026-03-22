import { Resend } from "resend";

let _resend: Resend | null = null;

/**
 * Lazy-initialized Resend client. Defers initialization to first use
 * so the build step doesn't throw when RESEND_API_KEY is not set.
 */
export function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY environment variable");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
