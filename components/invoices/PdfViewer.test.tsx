import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock react-pdf CSS imports upfront (they can't be resolved in test env)
vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

// Mock react-pdf before importing PdfViewer
let onLoadSuccessCallback: ((args: { numPages: number }) => void) | null = null;
let onLoadErrorCallback: ((error: Error) => void) | null = null;

vi.mock("react-pdf", () => ({
  Document: ({
    children,
    onLoadSuccess,
    onLoadError,
  }: {
    children: React.ReactNode;
    file: string;
    onLoadSuccess?: (args: { numPages: number }) => void;
    onLoadError?: (error: Error) => void;
  }) => {
    onLoadSuccessCallback = onLoadSuccess ?? null;
    onLoadErrorCallback = onLoadError ?? null;
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber, scale }: { pageNumber: number; scale: number }) => (
    <div data-testid={`pdf-page-${pageNumber}`} data-scale={scale}>
      Page {pageNumber}
    </div>
  ),
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: "" },
  },
}));

import PdfViewer from "./PdfViewer";

describe("PdfViewer", () => {
  beforeEach(() => {
    onLoadSuccessCallback = null;
    onLoadErrorCallback = null;
  });

  // --- PDF rendering ---

  it("renders Document component for PDF file type", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    expect(screen.getByTestId("pdf-document")).toBeDefined();
  });

  it("renders pages after document loads", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadSuccessCallback?.({ numPages: 3 });
    });
    expect(screen.getByTestId("pdf-page-1")).toBeDefined();
    expect(screen.getByTestId("pdf-page-2")).toBeDefined();
    expect(screen.getByTestId("pdf-page-3")).toBeDefined();
  });

  it("shows page indicator for PDFs after load", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadSuccessCallback?.({ numPages: 5 });
    });
    expect(screen.getByText(/page 1 of 5/i)).toBeDefined();
  });

  // --- Image rendering ---

  it("renders img element for JPEG file type", () => {
    render(
      <PdfViewer signedUrl="https://example.com/photo.jpg" fileType="image/jpeg" />
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://example.com/photo.jpg");
  });

  it("renders img element for PNG file type", () => {
    render(
      <PdfViewer signedUrl="https://example.com/scan.png" fileType="image/png" />
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://example.com/scan.png");
  });

  it("does not show page indicator for images", () => {
    render(
      <PdfViewer signedUrl="https://example.com/photo.jpg" fileType="image/jpeg" />
    );
    expect(screen.queryByText(/page/i)).toBeNull();
  });

  // --- Toolbar / zoom ---

  it("renders zoom controls", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    expect(screen.getByLabelText(/zoom in/i)).toBeDefined();
    expect(screen.getByLabelText(/zoom out/i)).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("zoom in increments scale by 25%", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadSuccessCallback?.({ numPages: 1 });
    });
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    expect(screen.getByText("125%")).toBeDefined();
  });

  it("zoom out decrements scale by 25%", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadSuccessCallback?.({ numPages: 1 });
    });
    fireEvent.click(screen.getByLabelText(/zoom out/i));
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("zoom does not exceed 200%", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    // Click zoom in enough times to hit the cap
    const zoomIn = screen.getByLabelText(/zoom in/i);
    for (let i = 0; i < 10; i++) {
      fireEvent.click(zoomIn);
    }
    expect(screen.getByText("200%")).toBeDefined();
  });

  it("zoom does not go below 50%", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    const zoomOut = screen.getByLabelText(/zoom out/i);
    for (let i = 0; i < 10; i++) {
      fireEvent.click(zoomOut);
    }
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("reset zoom button returns to 100%", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    expect(screen.getByText("150%")).toBeDefined();
    fireEvent.click(screen.getByLabelText(/reset zoom/i));
    expect(screen.getByText("100%")).toBeDefined();
  });

  // --- Error state ---

  it("shows error state when PDF fails to load", () => {
    render(
      <PdfViewer signedUrl="https://example.com/bad.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadErrorCallback?.(new Error("Failed to load"));
    });
    expect(screen.getByText(/unable to load document/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  // --- Loading state ---

  it("shows loading state initially for PDFs", () => {
    render(
      <PdfViewer signedUrl="https://example.com/doc.pdf" fileType="application/pdf" />
    );
    expect(screen.getByText(/loading document/i)).toBeDefined();
  });

  it("shows loading state initially for images", () => {
    render(
      <PdfViewer signedUrl="https://example.com/photo.jpg" fileType="image/jpeg" />
    );
    expect(screen.getByText(/loading document/i)).toBeDefined();
  });

  it("shows error state when image fails to load", () => {
    render(
      <PdfViewer signedUrl="https://example.com/bad.jpg" fileType="image/jpeg" />
    );
    const img = screen.getByRole("img");
    fireEvent.error(img);
    expect(screen.getByText(/unable to load document/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  it("handles zero-page PDF as error", () => {
    render(
      <PdfViewer signedUrl="https://example.com/empty.pdf" fileType="application/pdf" />
    );
    act(() => {
      onLoadSuccessCallback?.({ numPages: 0 });
    });
    // With 0 pages, no pages render and no page indicator shows
    expect(screen.queryByText(/page/i)).toBeNull();
  });
});
