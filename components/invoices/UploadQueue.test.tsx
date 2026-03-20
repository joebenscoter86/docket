import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import UploadQueue from "./UploadQueue";

// Mock useInvoiceStatuses
vi.mock("@/lib/hooks/useInvoiceStatuses", () => ({
  useInvoiceStatuses: vi.fn(() => ({ statuses: {}, isConnected: true })),
}));

// Mock crypto.randomUUID — first call is batch ID, subsequent are entry IDs
let uuidCounter = 0;
const mockUUID = vi.fn(() => {
  const id = uuidCounter === 0 ? "mock-batch-id" : `entry-${uuidCounter}`;
  uuidCounter++;
  return id;
});
vi.stubGlobal("crypto", { randomUUID: mockUUID });

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("UploadQueue", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    uuidCounter = 0;
  });

  it("renders a row for each file", () => {
    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.png", 2048, "image/png"),
    ];
    // Use a never-resolving fetch so uploads stay in progress
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<UploadQueue files={files} />);

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.png")).toBeInTheDocument();
  });

  it("uploads files with batch_id in FormData", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { invoiceId: "inv-1" } }),
    });
    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const call = mockFetch.mock.calls[0];
    const formData = call[1].body as FormData;
    expect(formData.get("batch_id")).toBe("mock-batch-id");
  });

  it("limits concurrent uploads to 3", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const files = Array.from({ length: 5 }, (_, i) =>
      createFile(`file-${i}.pdf`, 1024, "application/pdf")
    );
    render(<UploadQueue files={files} />);

    // Wait for concurrent uploads to start
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    // Resolve first upload to start 4th
    act(() => {
      resolvers[0]({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-0" } }),
      });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  it("shows batch summary when all uploads complete", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      const id = `inv-${callCount++}`;
      return { ok: true, json: async () => ({ data: { invoiceId: id } }) };
    });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/2 of 2/)).toBeInTheDocument();
    });
  });

  it("shows failure count in summary when upload fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-1" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Upload failed" }),
      });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
      expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    });
  });

  it("adds beforeunload handler during uploads", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const addSpy = vi.spyOn(window, "addEventListener");

    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    expect(addSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
    addSpy.mockRestore();
  });

  it("shows retry button on failed uploads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Upload failed" }),
    });

    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("skips remaining files when usage limit is hit", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-1" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "Monthly invoice limit reached",
          code: "USAGE_LIMIT",
        }),
      });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
      createFile("c.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/Monthly limit reached/)).toBeInTheDocument();
    });
  });
});
