import { runExtraction } from "./run";
import { logger } from "@/lib/utils/logger";

/**
 * Simple concurrency limiter — replaces p-limit which has webpack compatibility
 * issues with Next.js 14 (uses #async_hooks subpath import).
 */
function createLimit(concurrency: number) {
  let activeCount = 0;
  let pendingCount = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      pendingCount--;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return {
    get activeCount() { return activeCount; },
    get pendingCount() { return pendingCount; },
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
          pendingCount++;
          queue.push(execute);
        }
      });
    },
  };
}

const extractionLimit = createLimit(5);

export function enqueueExtraction(params: {
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

  return extractionLimit.run(() => runExtraction(params));
}
