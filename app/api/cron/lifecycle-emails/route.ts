import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";
import {
  sendNoUploadNudgeEmail,
  sendNoSyncNudgeEmail,
  sendPostTrialFollowupEmail,
} from "@/lib/email/triggers";
import { logger } from "@/lib/utils/logger";

/**
 * Lifecycle email cron job. Runs daily via Vercel Cron.
 *
 * Checks for users in each lifecycle stage and sends the appropriate
 * nudge/followup email. All sends are deduped via email_log.
 *
 * Stages:
 * 1. No upload nudge (Day 3 after signup, no invoices uploaded)
 * 2. No sync nudge (Day 7 after signup, extracted but never synced)
 * 3. Post-trial followup (Day 3, 7, 14 after trial exhausted)
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel sets this header automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  let sent = 0;

  try {
    // ---------------------------------------------------------------
    // 1. No upload nudge: signed up 3+ days ago, zero invoices
    // ---------------------------------------------------------------
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const { data: noUploadUsers } = await admin
      .from("users")
      .select("id")
      .lt("created_at", threeDaysAgo.toISOString())
      .eq("subscription_status", "inactive")
      .eq("is_design_partner", false);

    if (noUploadUsers) {
      for (const user of noUploadUsers) {
        // Check if they have any invoices via org_memberships
        const { data: memberships } = await admin
          .from("org_memberships")
          .select("org_id")
          .eq("user_id", user.id);

        if (!memberships || memberships.length === 0) {
          await sendNoUploadNudgeEmail(user.id);
          sent++;
          continue;
        }

        const orgIds = memberships.map((m) => m.org_id);
        const { count } = await admin
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .in("org_id", orgIds);

        if (count === 0) {
          await sendNoUploadNudgeEmail(user.id);
          sent++;
        }
      }
    }

    // ---------------------------------------------------------------
    // 2. No sync nudge: signed up 7+ days ago, has extractions, zero syncs
    // ---------------------------------------------------------------
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: noSyncUsers } = await admin
      .from("users")
      .select("id")
      .lt("created_at", sevenDaysAgo.toISOString())
      .eq("subscription_status", "inactive")
      .eq("is_design_partner", false);

    if (noSyncUsers) {
      for (const user of noSyncUsers) {
        const { data: memberships } = await admin
          .from("org_memberships")
          .select("org_id")
          .eq("user_id", user.id);

        if (!memberships || memberships.length === 0) continue;

        const orgIds = memberships.map((m) => m.org_id);

        // Count extracted invoices (pending_review or approved)
        const { count: extractedCount } = await admin
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .in("org_id", orgIds)
          .in("status", ["pending_review", "approved"]);

        if (!extractedCount || extractedCount === 0) continue;

        // Check if any have been synced
        const { count: syncedCount } = await admin
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .in("org_id", orgIds)
          .eq("status", "synced");

        if (syncedCount === 0) {
          await sendNoSyncNudgeEmail(user.id, extractedCount);
          sent++;
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. Post-trial followup: trial exhausted, not subscribed
    //    Day 3 = sequence 1, Day 7 = sequence 2, Day 14 = sequence 3
    // ---------------------------------------------------------------
    const { data: exhaustedUsers } = await admin
      .from("users")
      .select("id, trial_invoices_used")
      .gte("trial_invoices_used", TRIAL_INVOICE_LIMIT)
      .eq("subscription_status", "inactive")
      .eq("is_design_partner", false);

    if (exhaustedUsers) {
      for (const user of exhaustedUsers) {
        // Find when trial was exhausted (last trial_exhausted email sent_at)
        const { data: exhaustedLog } = await admin
          .from("email_log")
          .select("sent_at")
          .eq("user_id", user.id)
          .eq("email_type", "trial_exhausted")
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        if (!exhaustedLog?.sent_at) continue;

        const exhaustedAt = new Date(exhaustedLog.sent_at);
        const daysSinceExhausted = Math.floor(
          (now.getTime() - exhaustedAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        const invoicesProcessed = user.trial_invoices_used ?? TRIAL_INVOICE_LIMIT;

        if (daysSinceExhausted >= 14) {
          await sendPostTrialFollowupEmail(user.id, 3, invoicesProcessed);
          sent++;
        } else if (daysSinceExhausted >= 7) {
          await sendPostTrialFollowupEmail(user.id, 2, invoicesProcessed);
          sent++;
        } else if (daysSinceExhausted >= 3) {
          await sendPostTrialFollowupEmail(user.id, 1, invoicesProcessed);
          sent++;
        }
      }
    }

    logger.info("lifecycle_emails_cron_complete", {
      action: "lifecycle_emails_cron",
      status: "success",
      sent,
    });

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    logger.error("lifecycle_emails_cron_failed", {
      action: "lifecycle_emails_cron",
      status: "error",
      error: String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
