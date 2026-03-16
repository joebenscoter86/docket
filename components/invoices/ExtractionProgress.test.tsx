import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ExtractionProgress from "./ExtractionProgress";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const defaultProps = {
  invoiceId: "test-invoice-123",
  status: null as Parameters<typeof ExtractionProgress>[0]["status"],
  errorMessage: null as string | null,
  onRetry: vi.fn(),
  onUploadAnother: vi.fn(),
};

describe("ExtractionProgress", () => {
  it("shows all three step labels", () => {
    render(<ExtractionProgress {...defaultProps} />);
    expect(screen.getByText("Uploaded")).toBeDefined();
    expect(screen.getByText("Extracting data")).toBeDefined();
    expect(screen.getByText("Ready for review")).toBeDefined();
  });

  it("marks steps correctly for extracting status", () => {
    const { container } = render(
      <ExtractionProgress {...defaultProps} status="extracting" />
    );
    const steps = container.querySelectorAll("[data-step]");
    expect(steps).toHaveLength(3);
    expect(steps[0].getAttribute("data-state")).toBe("complete");
    expect(steps[1].getAttribute("data-state")).toBe("active");
    expect(steps[2].getAttribute("data-state")).toBe("pending");
  });

  it("marks all steps complete for pending_review", () => {
    const { container } = render(
      <ExtractionProgress {...defaultProps} status="pending_review" />
    );
    const steps = container.querySelectorAll("[data-step]");
    expect(steps).toHaveLength(3);
    expect(steps[0].getAttribute("data-state")).toBe("complete");
    expect(steps[1].getAttribute("data-state")).toBe("complete");
    expect(steps[2].getAttribute("data-state")).toBe("complete");
  });

  it("shows Review Invoice link with correct href for pending_review", () => {
    render(
      <ExtractionProgress {...defaultProps} status="pending_review" />
    );
    const link = screen.getByText("Review Invoice");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/invoices/test-invoice-123/review");
  });

  it("shows error message for error status", () => {
    render(
      <ExtractionProgress
        {...defaultProps}
        status="error"
        errorMessage="Extraction timed out"
      />
    );
    expect(screen.getByText("Extraction timed out")).toBeDefined();
  });

  it("shows Retry button for error status", () => {
    render(
      <ExtractionProgress
        {...defaultProps}
        status="error"
        errorMessage="Failed"
      />
    );
    expect(screen.getByText("Retry")).toBeDefined();
  });

  it("calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(
      <ExtractionProgress
        {...defaultProps}
        status="error"
        errorMessage="Failed"
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("marks extracting step as error state for error status", () => {
    const { container } = render(
      <ExtractionProgress
        {...defaultProps}
        status="error"
        errorMessage="Failed"
      />
    );
    const steps = container.querySelectorAll("[data-step]");
    expect(steps[0].getAttribute("data-state")).toBe("complete");
    expect(steps[1].getAttribute("data-state")).toBe("error");
    expect(steps[2].getAttribute("data-state")).toBe("pending");
  });

  it("shows Upload Another button", () => {
    render(<ExtractionProgress {...defaultProps} status="uploading" />);
    expect(screen.getByText("Upload another")).toBeDefined();
  });

  it("calls onUploadAnother when Upload Another is clicked", () => {
    const onUploadAnother = vi.fn();
    render(
      <ExtractionProgress
        {...defaultProps}
        status="uploading"
        onUploadAnother={onUploadAnother}
      />
    );
    fireEvent.click(screen.getByText("Upload another"));
    expect(onUploadAnother).toHaveBeenCalledOnce();
  });

  it("has aria-live region", () => {
    const { container } = render(
      <ExtractionProgress {...defaultProps} status="extracting" />
    );
    const liveRegion = container.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
  });

  it("shows retryError when provided", () => {
    render(
      <ExtractionProgress
        {...defaultProps}
        status="error"
        errorMessage="Original error"
        retryError="Retry also failed"
      />
    );
    expect(screen.getByText("Retry also failed")).toBeDefined();
  });

  it("shows Review Invoice link for approved status", () => {
    render(
      <ExtractionProgress {...defaultProps} status="approved" />
    );
    const link = screen.getByText("Review Invoice");
    expect(link.getAttribute("href")).toBe("/invoices/test-invoice-123/review");
  });

  it("shows Review Invoice link for synced status", () => {
    render(
      <ExtractionProgress {...defaultProps} status="synced" />
    );
    const link = screen.getByText("Review Invoice");
    expect(link.getAttribute("href")).toBe("/invoices/test-invoice-123/review");
  });
});
