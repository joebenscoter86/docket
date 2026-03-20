import { runExtraction } from "./run";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

const CONCURRENCY_LIMIT = 5;
const QUEUE_TIMEOUT_MS = 120_000; // 120 seconds

/**
 * Simple concurrency limiter with timeout. Replaces p-limit which has webpack
 * compatibility issues with Next.js 14 (uses #async_hooks subpath import).
 *
 * If a queued task doesn't get a slot within `timeoutMs`, the returned promise
 * rejects with a timeout error instead of waiting forever.
 */
function createLimit(concurrency: number, timeoutMs: number) {
  let activeCount = 0;
  const queue: Array<{
    execute: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  function next() {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const entry = queue.shift()!;
      clearTimeout(entry.timer);
      entry.execute();
    }
  }

  return {
    get activeCount() { return activeCount; },
    get pendingCount() { return queue.length; },
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const execute = () => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              activeCount--;
              next();
            });
        };

        if (activeCount < concurrency) {
          activeCount++;
          execute();
        } else {
          const timer = setTimeout(() => {
            const idx = queue.findIndex((e) => e.execute === execute);
            if (idx !== -1) {
              queue.splice(idx, 1);
              reject(new Error("Extraction queue timed out. Please retry."));
            }
          }, timeoutMs);

          queue.push({ execute, reject, timer });
        }
      });
    },
  };
}

const extractionLimit = createLimit(CONCURRENCY_LIMIT, QUEUE_TIMEOUT_MS);

export async function enqueueExtraction(params: {
  invoiceId: string;
  orgId: string;
  userId: string;
  filePath: string;
  fileType: string;
}) {
  logger.info("extraction_enqueued", {
    action: "enqueue_extraction",
    invoiceId: params.invoiceId,
    orgId: params.orgId,
    pendingCount: extractionLimit.pendingCount,
    activeCount: extractionLimit.activeCount,
  });

  try {
    return await extractionLimit.run(() => runExtraction(params));
  } catch (error) {
    // On timeout, set the invoice to error status so the user sees it
    if (error instanceof Error && error.message.includes("queue timed out")) {
      logger.error("extraction_queue_timeout", {
        action: "enqueue_extraction",
        invoiceId: params.invoiceId,
        orgId: params.orgId,
        timeoutMs: QUEUE_TIMEOUT_MS,
      });

      const admin = createAdminClient();
      await admin
        .from("invoices")
        .update({
          status: "error",
          error_message: "Extraction queue timed out. Please retry.",
        })
        .eq("id", params.invoiceId);
    }
    throw error;
  }
}
