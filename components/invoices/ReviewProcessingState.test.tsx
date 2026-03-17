import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ReviewProcessingState from "./ReviewProcessingState";

// Mock next/navigation
const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

// Mock useInvoiceStatus
const mockUseInvoiceStatus = vi.fn();
vi.mock("@/lib/hooks/useInvoiceStatus", () => ({
  useInvoiceStatus: (...args: unknown[]) => mockUseInvoiceStatus(...args),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock fetch for retry
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ReviewProcessingState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInvoiceStatus.mockReturnValue({
      status: "extracting",
      errorMessage: null,
      isConnected: true,
    });
  });

  it("renders ExtractionProgress with current status", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(screen.getByText("Extracting data")).toBeDefined();
  });

  it("subscribes to realtime status via useInvoiceStatus", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(mockUseInvoiceStatus).toHaveBeenCalledWith("inv-1");
  });

  it("calls retry endpoint on retry click", async () => {
    mockUseInvoiceStatus.mockReturnValue({
      status: "error",
      errorMessage: "Extraction failed",
      isConnected: true,
    });
    mockFetch.mockResolvedValue({ ok: true });

    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="error" />);
    fireEvent.click(screen.getByText("Retry"));

    expect(mockFetch).toHaveBeenCalledWith("/api/invoices/inv-1/retry", { method: "POST" });
  });

  it("navigates to upload on 'Upload another' click", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    fireEvent.click(screen.getByText("Upload another"));
    expect(mockPush).toHaveBeenCalledWith("/upload");
  });

  it("refreshes page when status transitions to pending_review", () => {
    mockUseInvoiceStatus.mockReturnValue({
      status: "pending_review",
      errorMessage: null,
      isConnected: true,
    });
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(mockRefresh).toHaveBeenCalled();
  });
});
