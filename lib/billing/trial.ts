import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

type IncrementResult =
  | { success: true; newCount: number; failedOpen?: boolean }
  | { success: false; reason: "trial_exhausted" };

/**
 * Atomically increment trial_invoices_used for a trial user.
 *
 * Uses a Postgres function with `WHERE trial_invoices_used < 10`
 * to prevent race conditions from exceeding the limit.
 *
 * - Returns { success: true, newCount } on successful increment.
 * - Returns { success: false, reason: "trial_exhausted" } if limit reached (including races).
 * - Fails open on transient DB errors (logs to Sentry, returns success with failedOpen flag).
 */
export async function incrementTrialInvoice(userId: string): Promise<IncrementResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("increment_trial_invoice", {
    p_user_id: userId,
  });

  if (error) {
    // Fail-open: don't block upload on transient DB errors
    logger.error("trial_increment_rpc_failed", {
      userId,
      error: error.message,
    });
    return { success: true, newCount: -1, failedOpen: true };
  }

  if (data === -1) {
    return { success: false, reason: "trial_exhausted" };
  }

  return { success: true, newCount: data as number };
}
