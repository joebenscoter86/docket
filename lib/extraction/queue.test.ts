import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunExtraction = vi.fn();
vi.mock("./run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

const mockAdminUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (...args: unknown[]) => mockAdminUpdate(...args),
    }),
  }),
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

    // Advance timers to let queued items process
    await vi.advanceTimersByTimeAsync(500);

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

  it("times out queued extractions after 120 seconds", async () => {
    // Fill all 5 slots with extractions that resolve only when we say so
    const blockerResolvers: Array<() => void> = [];
    mockRunExtraction.mockImplementation(() => {
      return new Promise<{ success: boolean }>((resolve) => {
        blockerResolvers.push(() => resolve({ success: true }));
      });
    });

    // Fill all 5 concurrency slots — catch to prevent unhandled rejection warnings
    const blockerPromises = Array.from({ length: 5 }, (_, i) =>
      enqueueExtraction({ ...baseParams, invoiceId: `blocker-${i}` }).catch(() => {})
    );

    // This 6th extraction should queue and eventually time out.
    // Attach .catch() BEFORE advancing timers so the rejection is handled.
    let timeoutError: Error | null = null;
    const timeoutPromise = enqueueExtraction({
      ...baseParams,
      invoiceId: "timeout-victim",
    }).catch((err: Error) => {
      timeoutError = err;
    });

    // Advance past the 120s timeout
    await vi.advanceTimersByTimeAsync(120_001);
    await timeoutPromise;

    expect(timeoutError).not.toBeNull();
    expect(timeoutError!.message).toBe(
      "Extraction queue timed out. Please retry."
    );

    // Should set invoice status to error
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        error_message: "Extraction queue timed out. Please retry.",
      })
    );

    // Should log the timeout
    expect(logger.error).toHaveBeenCalledWith(
      "extraction_queue_timeout",
      expect.objectContaining({
        invoiceId: "timeout-victim",
        timeoutMs: 120_000,
      })
    );

    // Clean up: resolve blockers so promises settle
    blockerResolvers.forEach((r) => r());
    await Promise.all(blockerPromises);
  });
});

// Need afterEach import
import { afterEach } from "vitest";
