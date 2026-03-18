import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadZone from "./UploadZone";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

/** Simulate selecting file(s) via the hidden input */
function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", {
    value: files,
    writable: false,
    configurable: true,
  });
  fireEvent.change(input, { target: { files } });
}

/** Create a mock dataTransfer object for drop events */
function createDropData(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map(() => ({ kind: "file" })),
      types: ["Files"],
    },
  };
}

function getInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function getZone() {
  return screen.getByRole("button", { name: "Upload invoice file" });
}

describe("UploadZone", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: successful upload
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          invoiceId: "inv-1",
          fileName: "invoice.pdf",
          signedUrl: "https://example.com/signed",
        },
      }),
    });
  });

  describe("Idle state", () => {
    it('renders "Drag & drop invoices here" and "Browse Files" button', () => {
      render(<UploadZone />);
      expect(screen.getByText("Drag & drop invoices here")).toBeInTheDocument();
      expect(screen.getByText("Browse Files")).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("rejects files over 10MB", () => {
      render(<UploadZone />);
      const bigFile = createFile("huge.pdf", 11 * 1024 * 1024, "application/pdf");
      selectFiles(getInput(), [bigFile]);
      expect(screen.getByText("File exceeds 10MB limit.")).toBeInTheDocument();
    });

    it("rejects unsupported file types", () => {
      render(<UploadZone />);
      const docFile = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      selectFiles(getInput(), [docFile]);
      expect(
        screen.getByText(
          "Unsupported file type. Please upload a PDF, JPG, or PNG."
        )
      ).toBeInTheDocument();
    });

    it("accepts valid PDF and transitions to uploading state", () => {
      render(<UploadZone />);
      const pdfFile = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [pdfFile]);
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("accepts valid JPEG and transitions to uploading state", () => {
      render(<UploadZone />);
      const jpegFile = createFile("photo.jpg", 1024, "image/jpeg");
      selectFiles(getInput(), [jpegFile]);
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("accepts valid PNG and transitions to uploading state", () => {
      render(<UploadZone />);
      const pngFile = createFile("scan.png", 1024, "image/png");
      selectFiles(getInput(), [pngFile]);
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("rejects multiple files", () => {
      render(<UploadZone />);
      const file1 = createFile("a.pdf", 1024, "application/pdf");
      const file2 = createFile("b.pdf", 1024, "application/pdf");

      fireEvent.drop(getZone(), createDropData([file1, file2]));

      expect(
        screen.getByText("Please upload one file at a time.")
      ).toBeInTheDocument();
    });

    it("clears error when valid file is selected after invalid one", () => {
      render(<UploadZone />);
      const input = getInput();

      // First: invalid file
      const badFile = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      selectFiles(input, [badFile]);
      expect(
        screen.getByText(
          "Unsupported file type. Please upload a PDF, JPG, or PNG."
        )
      ).toBeInTheDocument();

      // Second: valid file — error should clear
      const goodFile = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(input, [goodFile]);
      expect(
        screen.queryByText(
          "Unsupported file type. Please upload a PDF, JPG, or PNG."
        )
      ).not.toBeInTheDocument();
    });
  });

  describe("Upload lifecycle", () => {
    it("shows progress bar and file name during upload", () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    });

    it("transitions to success after upload completes", async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(screen.getByText("Upload Another")).toBeInTheDocument();
      });
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    });

    it("calls onUploadComplete with invoiceId after successful upload", async () => {
      const onUploadComplete = vi.fn();
      render(<UploadZone onUploadComplete={onUploadComplete} />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalledWith("inv-1");
      });
    });

    it("does not call onUploadComplete on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Upload failed", code: "INTERNAL_ERROR" }),
      });
      const onUploadComplete = vi.fn();
      render(<UploadZone onUploadComplete={onUploadComplete} />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(screen.getAllByText("Upload failed").length).toBeGreaterThan(0);
      });
      expect(onUploadComplete).not.toHaveBeenCalled();
    });

    it('resets to idle when "Upload Another" is clicked', async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(screen.getByText("Upload Another")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Upload Another"));

      expect(
        screen.getByText("Drag & drop invoices here")
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it('has role="button" with aria-label and tabindex="0"', () => {
      render(<UploadZone />);
      const zone = getZone();
      expect(zone).toHaveAttribute("tabindex", "0");
    });

    it("Enter key triggers file input", () => {
      render(<UploadZone />);
      const zone = getZone();
      const input = getInput();
      const clickSpy = vi.spyOn(input, "click");

      zone.focus();
      fireEvent.keyDown(zone, { key: "Enter" });

      expect(clickSpy).toHaveBeenCalled();
      expect(document.activeElement).toBe(zone);
    });

    it("Space key triggers file input", () => {
      render(<UploadZone />);
      const zone = getZone();
      const input = getInput();
      const clickSpy = vi.spyOn(input, "click");

      zone.focus();
      fireEvent.keyDown(zone, { key: " " });

      expect(clickSpy).toHaveBeenCalled();
      expect(document.activeElement).toBe(zone);
    });

    it("links error to zone via aria-describedby when error present", () => {
      render(<UploadZone />);
      const badFile = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      selectFiles(getInput(), [badFile]);

      const zone = getZone();
      expect(zone).toHaveAttribute("aria-describedby", "upload-error");
      const errorEl = document.getElementById("upload-error");
      expect(errorEl).toBeInTheDocument();
    });

    it("announces state changes via aria-live region", async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion?.textContent).toMatch(/uploading/i);

      await waitFor(() => {
        expect(liveRegion?.textContent).toMatch(/upload complete/i);
      });
    });
  });

  describe("Drag interactions", () => {
    it('shows "Drop your file here" on dragenter', () => {
      render(<UploadZone />);
      const zone = getZone();

      fireEvent.dragEnter(zone, {
        dataTransfer: { items: [{ kind: "file" }] },
      });

      expect(screen.getByText("Drop your file here")).toBeInTheDocument();
    });

    it("returns to idle on dragleave", () => {
      render(<UploadZone />);
      const zone = getZone();

      fireEvent.dragEnter(zone, {
        dataTransfer: { items: [{ kind: "file" }] },
      });
      expect(screen.getByText("Drop your file here")).toBeInTheDocument();

      fireEvent.dragLeave(zone);
      expect(
        screen.getByText("Drag & drop invoices here")
      ).toBeInTheDocument();
    });

    it("handles file drop and shows uploading state", () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");

      fireEvent.drop(getZone(), createDropData([file]));

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("shows validation error on invalid file drop", () => {
      render(<UploadZone />);
      const file = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      fireEvent.drop(getZone(), createDropData([file]));

      expect(
        screen.getByText(
          "Unsupported file type. Please upload a PDF, JPG, or PNG."
        )
      ).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("ignores file selection while uploading", () => {
      // Never-resolving fetch to keep component in uploading state
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      render(<UploadZone />);
      const input = getInput();

      // Start upload
      const file1 = createFile("first.pdf", 1024, "application/pdf");
      selectFiles(input, [file1]);
      expect(screen.getByText("first.pdf")).toBeInTheDocument();

      // Try to upload another while uploading
      const file2 = createFile("second.pdf", 1024, "application/pdf");
      selectFiles(input, [file2]);

      // Should still show first file
      expect(screen.getByText("first.pdf")).toBeInTheDocument();
      expect(screen.queryByText("second.pdf")).not.toBeInTheDocument();
    });

    it("ignores drop while uploading", () => {
      // Never-resolving fetch to keep component in uploading state
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      render(<UploadZone />);

      // Start upload via input
      const file1 = createFile("first.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file1]);

      // Try to drop while uploading
      const file2 = createFile("second.pdf", 1024, "application/pdf");
      fireEvent.drop(getZone(), createDropData([file2]));

      // Should still show first file
      expect(screen.getByText("first.pdf")).toBeInTheDocument();
      expect(screen.queryByText("second.pdf")).not.toBeInTheDocument();
    });
  });

  describe("API error handling", () => {
    it("shows error message on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "File exceeds 10MB limit.", code: "VALIDATION_ERROR" }),
      });

      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(screen.getByText("File exceeds 10MB limit.")).toBeInTheDocument();
      });
    });

    it("shows error message on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      await waitFor(() => {
        expect(
          screen.getByText("Upload failed. Please check your connection and try again.")
        ).toBeInTheDocument();
      });
    });
  });
});
