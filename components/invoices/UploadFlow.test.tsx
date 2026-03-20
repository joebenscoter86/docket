import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UploadFlow from "./UploadFlow";

// Mock child components
vi.mock("./UploadZone", () => ({
  default: ({ onUploadComplete, onUploadStart }: {
    onUploadComplete?: (id: string) => void;
    onUploadStart?: (files: File[]) => void;
  }) => (
    <div data-testid="upload-zone">
      <button onClick={() => onUploadComplete?.("inv-1")}>
        Single Upload
      </button>
      <button onClick={() => {
        const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
        const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
        onUploadStart?.([f1, f2]);
      }}>
        Batch Upload
      </button>
    </div>
  ),
}));

vi.mock("./ExtractionProgress", () => ({
  default: () => <div data-testid="extraction-progress">ExtractionProgress</div>,
}));

vi.mock("./UploadQueue", () => ({
  default: ({ files }: { files: File[] }) => (
    <div data-testid="upload-queue">Queue: {files.length} files</div>
  ),
}));

vi.mock("@/lib/hooks/useInvoiceStatus", () => ({
  useInvoiceStatus: () => ({ status: null, errorMessage: null, isConnected: false }),
}));

describe("UploadFlow", () => {
  it("renders UploadZone initially", () => {
    render(<UploadFlow />);
    expect(screen.getByTestId("upload-zone")).toBeInTheDocument();
  });

  it("shows ExtractionProgress after single-file upload", () => {
    render(<UploadFlow />);
    fireEvent.click(screen.getByText("Single Upload"));
    expect(screen.getByTestId("extraction-progress")).toBeInTheDocument();
  });

  it("shows UploadQueue after multi-file upload", () => {
    render(<UploadFlow />);
    fireEvent.click(screen.getByText("Batch Upload"));
    expect(screen.getByTestId("upload-queue")).toBeInTheDocument();
    expect(screen.getByText("Queue: 2 files")).toBeInTheDocument();
  });
});
