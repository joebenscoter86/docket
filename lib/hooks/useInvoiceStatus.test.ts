import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useInvoiceStatus } from "./useInvoiceStatus";

// Types for the realtime callback
type RealtimeCallback = (payload: {
  new: { status: string; error_message: string | null };
}) => void;

type SubscribeCallback = (
  status: string,
  err?: { message: string }
) => void;

// Mock channel factory
function createMockChannel() {
  let realtimeCallback: RealtimeCallback | null = null;
  let subscribeCallback: SubscribeCallback | null = null;

  const channel = {
    on: vi.fn().mockImplementation(
      (
        _event: string,
        _filter: Record<string, unknown>,
        callback: RealtimeCallback
      ) => {
        realtimeCallback = callback;
        return channel;
      }
    ),
    subscribe: vi.fn().mockImplementation((callback?: SubscribeCallback) => {
      subscribeCallback = callback ?? null;
      // Auto-trigger SUBSCRIBED status
      if (callback) {
        callback("SUBSCRIBED");
      }
      return channel;
    }),
    unsubscribe: vi.fn(),
  };

  return {
    channel,
    simulateEvent(payload: {
      new: { status: string; error_message: string | null };
    }) {
      realtimeCallback?.(payload);
    },
    simulateSubscribeError(message: string) {
      subscribeCallback?.("CHANNEL_ERROR", { message });
    },
  };
}

// Mock Supabase client
const mockSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
const mockRemoveChannel = vi.fn();

let latestMockChannel: ReturnType<typeof createMockChannel>;

const mockChannel = vi.fn().mockImplementation(() => {
  latestMockChannel = createMockChannel();
  return latestMockChannel.channel;
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

describe("useInvoiceStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { status: "extracting", error_message: null },
      error: null,
    });
  });

  it("returns null status when invoiceId is null", () => {
    const { result } = renderHook(() => useInvoiceStatus(null));

    expect(result.current.status).toBeNull();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it("fetches current status on mount", async () => {
    const { result } = renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    expect(mockFrom).toHaveBeenCalledWith("invoices");
    expect(mockSelect).toHaveBeenCalledWith("status, error_message");
    expect(mockEq).toHaveBeenCalledWith("id", "inv-123");
  });

  it("subscribes to realtime channel on mount", async () => {
    renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("invoice-status-inv-123");
    });

    expect(latestMockChannel.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "invoices",
        filter: "id=eq.inv-123",
      },
      expect.any(Function)
    );
    expect(latestMockChannel.channel.subscribe).toHaveBeenCalled();
  });

  it("updates status when realtime event arrives", async () => {
    const { result } = renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    act(() => {
      latestMockChannel.simulateEvent({
        new: { status: "pending_review", error_message: null },
      });
    });

    expect(result.current.status).toBe("pending_review");
    expect(result.current.errorMessage).toBeNull();
  });

  it("sets errorMessage when status is error", async () => {
    const { result } = renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    act(() => {
      latestMockChannel.simulateEvent({
        new: {
          status: "error",
          error_message: "Extraction timed out. Please retry.",
        },
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe(
      "Extraction timed out. Please retry."
    );
  });

  it("sets isConnected to true after subscription", async () => {
    const { result } = renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("cleans up channel on unmount", async () => {
    const { unmount } = renderHook(() => useInvoiceStatus("inv-123"));

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled();
    });

    const channelRef = latestMockChannel.channel;
    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(channelRef);
  });

  it("resubscribes when invoiceId changes", async () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useInvoiceStatus(id),
      { initialProps: { id: "inv-123" as string | null } }
    );

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("invoice-status-inv-123");
    });

    const firstChannel = latestMockChannel.channel;

    // Reset to track new calls
    mockSingle.mockResolvedValue({
      data: { status: "approved", error_message: null },
      error: null,
    });

    rerender({ id: "inv-456" });

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("invoice-status-inv-456");
    });

    // Old channel should be cleaned up
    expect(mockRemoveChannel).toHaveBeenCalledWith(firstChannel);
  });

  it("cleans up when invoiceId changes to null", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useInvoiceStatus(id),
      { initialProps: { id: "inv-123" as string | null } }
    );

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    const channelRef = latestMockChannel.channel;

    rerender({ id: null });

    expect(mockRemoveChannel).toHaveBeenCalledWith(channelRef);
    expect(result.current.status).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("handles initial fetch failure gracefully", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    const { result } = renderHook(() => useInvoiceStatus("inv-999"));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Status remains null on fetch error — realtime will still update it
    expect(result.current.status).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });
});
