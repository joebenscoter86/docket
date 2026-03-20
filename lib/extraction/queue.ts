import pLimit from "p-limit";
import { runExtraction } from "./run";
import { logger } from "@/lib/utils/logger";

const extractionLimit = pLimit(5);

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

  return extractionLimit(() => runExtraction(params));
}
