import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunExtraction = vi.fn();
vi.mock("./run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Must import after mocks are declared
import { enqueueExtraction } from "./queue";
import { logger } from "@/lib/utils/logger";

const baseParams = {
  invoiceId: "inv-1",
  orgId: "org-1",
  userId: "user-1",
  filePath: "orgs/org-1/inv-1.pdf",
  fileType: "application/pdf",
};

describe("enqueueExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runExtraction with provided params", async () => {
    mockRunExtraction.mockResolvedValueOnce({ success: true });

    const result = await enqueueExtraction(baseParams);

    expect(mockRunExtraction).toHaveBeenCalledWith(baseParams);
    expect(result).toEqual({ success: true });
  });

  it("logs extraction_enqueued on entry", async () => {
    mockRunExtraction.mockResolvedValueOnce({ success: true });

    await enqueueExtraction(baseParams);

    expect(logger.info).toHaveBeenCalledWith(
      "extraction_enqueued",
      expect.objectContaining({
        action: "enqueue_extraction",
        invoiceId: "inv-1",
        orgId: "org-1",
      })
    );
  });

  it("limits concurrency to 5 concurrent extractions", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockRunExtraction.mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      // Hold the slot open long enough for all 10 to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentConcurrent--;
      return { success: true };
    });

    // Enqueue 10 extractions concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      enqueueExtraction({ ...baseParams, invoiceId: `inv-${i}` })
    );

    await Promise.all(promises);

    expect(mockRunExtraction).toHaveBeenCalledTimes(10);
    expect(maxConcurrent).toBe(5);
  });

  it("propagates errors from runExtraction", async () => {
    mockRunExtraction.mockRejectedValueOnce(new Error("Extraction failed"));

    await expect(enqueueExtraction(baseParams)).rejects.toThrow(
      "Extraction failed"
    );
  });
});
