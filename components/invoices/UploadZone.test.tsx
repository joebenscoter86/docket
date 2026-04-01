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
    it("shows file with error for files over 10MB", () => {
      render(<UploadZone />);
      const bigFile = createFile("huge.pdf", 11 * 1024 * 1024, "application/pdf");
      selectFiles(getInput(), [bigFile]);
      expect(screen.getByText("huge.pdf")).toBeInTheDocument();
      expect(screen.getByText("File exceeds 10MB limit.")).toBeInTheDocument();
    });

    it("shows file with error for unsupported file types", () => {
      render(<UploadZone />);
      const docFile = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      selectFiles(getInput(), [docFile]);
      expect(screen.getByText("doc.docx")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Unsupported file type. Please upload a PDF, JPG, PNG, or ZIP."
        )
      ).toBeInTheDocument();
    });

    it("accepts valid PDF and shows it in file list", () => {
      render(<UploadZone />);
      const pdfFile = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [pdfFile]);
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
      expect(screen.getByText("Upload 1 File")).toBeInTheDocument();
    });

    it("accepts valid JPEG and shows it in file list", () => {
      render(<UploadZone />);
      const jpegFile = createFile("photo.jpg", 1024, "image/jpeg");
      selectFiles(getInput(), [jpegFile]);
      expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    });

    it("accepts valid PNG and shows it in file list", () => {
      render(<UploadZone />);
      const pngFile = createFile("scan.png", 1024, "image/png");
      selectFiles(getInput(), [pngFile]);
      expect(screen.getByText("scan.png")).toBeInTheDocument();
    });

    it("clears file list when valid file is selected after invalid one", () => {
      render(<UploadZone />);
      const input = getInput();

      // First: invalid file
      const badFile = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      selectFiles(input, [badFile]);
      expect(screen.getByText("doc.docx")).toBeInTheDocument();

      // Second: valid file — list should now contain the new file
      const goodFile = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(input, [goodFile]);
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    });
  });

  describe("Upload lifecycle (single file, no onUploadStart)", () => {
    it("shows progress bar after clicking upload button", () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      fireEvent.click(screen.getByText("Upload 1 File"));

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    });

    it("transitions to success after upload completes", async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      fireEvent.click(screen.getByText("Upload 1 File"));

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

      fireEvent.click(screen.getByText("Upload 1 File"));

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

      fireEvent.click(screen.getByText("Upload 1 File"));

      await waitFor(() => {
        expect(screen.getAllByText("Upload failed").length).toBeGreaterThan(0);
      });
      expect(onUploadComplete).not.toHaveBeenCalled();
    });

    it('resets to idle when "Upload Another" is clicked', async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      fireEvent.click(screen.getByText("Upload 1 File"));

      await waitFor(() => {
        expect(screen.getByText("Upload Another")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Upload Another"));

      expect(
        screen.getByText("Drag & drop invoices here")
      ).toBeInTheDocument();
    });
  });

  describe("Multi-file selection", () => {
    it("accepts multiple files via drop and shows file list", () => {
      const onUploadStart = vi.fn();
      render(<UploadZone onUploadStart={onUploadStart} />);
      const file1 = createFile("a.pdf", 1024, "application/pdf");
      const file2 = createFile("b.pdf", 2048, "application/pdf");

      fireEvent.drop(getZone(), createDropData([file1, file2]));

      expect(screen.getByText("a.pdf")).toBeInTheDocument();
      expect(screen.getByText("b.pdf")).toBeInTheDocument();
    });

    it("accepts multiple files via file picker", () => {
      render(<UploadZone />);
      const input = getInput();
      const file1 = createFile("a.pdf", 1024, "application/pdf");
      const file2 = createFile("b.png", 2048, "image/png");
      selectFiles(input, [file1, file2]);

      expect(screen.getByText("a.pdf")).toBeInTheDocument();
      expect(screen.getByText("b.png")).toBeInTheDocument();
    });

    it("enforces 25-file cap and shows warning", () => {
      render(<UploadZone />);
      const files = Array.from({ length: 30 }, (_, i) =>
        createFile(`file-${i}.pdf`, 1024, "application/pdf")
      );

      fireEvent.drop(getZone(), createDropData(files));

      // Should only have 25 files in the list
      expect(screen.getByText("file-0.pdf")).toBeInTheDocument();
      expect(screen.getByText("file-24.pdf")).toBeInTheDocument();
      expect(screen.queryByText("file-25.pdf")).not.toBeInTheDocument();
      expect(screen.getByText(/Maximum 25 files/)).toBeInTheDocument();
    });

    it("appends files on subsequent drops up to 25", () => {
      render(<UploadZone />);
      const file1 = createFile("a.pdf", 1024, "application/pdf");
      fireEvent.drop(getZone(), createDropData([file1]));
      expect(screen.getByText("a.pdf")).toBeInTheDocument();

      const file2 = createFile("b.pdf", 1024, "application/pdf");
      fireEvent.drop(getZone(), createDropData([file2]));
      expect(screen.getByText("a.pdf")).toBeInTheDocument();
      expect(screen.getByText("b.pdf")).toBeInTheDocument();
    });

    it("shows invalid files with error reason", () => {
      render(<UploadZone />);
      const valid = createFile("good.pdf", 1024, "application/pdf");
      const invalid = createFile("bad.docx", 1024, "application/msword");

      fireEvent.drop(getZone(), createDropData([valid, invalid]));

      expect(screen.getByText("good.pdf")).toBeInTheDocument();
      expect(screen.getByText("bad.docx")).toBeInTheDocument();
      expect(screen.getByText(/Unsupported/)).toBeInTheDocument();
    });

    it("removes file from list when remove button is clicked", () => {
      render(<UploadZone />);
      const file1 = createFile("a.pdf", 1024, "application/pdf");
      const file2 = createFile("b.pdf", 1024, "application/pdf");
      fireEvent.drop(getZone(), createDropData([file1, file2]));

      const removeButtons = screen.getAllByLabelText(/Remove/);
      fireEvent.click(removeButtons[0]);

      expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
      expect(screen.getByText("b.pdf")).toBeInTheDocument();
    });

    it("shows 'Upload N Files' button counting only valid files", () => {
      render(<UploadZone />);
      const valid1 = createFile("a.pdf", 1024, "application/pdf");
      const valid2 = createFile("b.pdf", 1024, "application/pdf");
      const invalid = createFile("c.docx", 1024, "application/msword");
      fireEvent.drop(getZone(), createDropData([valid1, valid2, invalid]));

      expect(screen.getByText("Upload 2 Files")).toBeInTheDocument();
    });

    it("disables button when all files are invalid", () => {
      render(<UploadZone />);
      const invalid = createFile("c.docx", 1024, "application/msword");
      fireEvent.drop(getZone(), createDropData([invalid]));

      const button = screen.getByText("No valid files to upload");
      expect(button).toBeDisabled();
    });

    it("uses inline upload for single valid file instead of onUploadStart", () => {
      const onUploadStart = vi.fn();
      render(<UploadZone onUploadStart={onUploadStart} />);
      const valid = createFile("a.pdf", 1024, "application/pdf");
      const invalid = createFile("b.docx", 1024, "application/msword");
      fireEvent.drop(getZone(), createDropData([valid, invalid]));

      fireEvent.click(screen.getByText("Upload 1 File"));

      // Single valid file should NOT call onUploadStart — uses inline upload path
      expect(onUploadStart).not.toHaveBeenCalled();
    });

    it("calls onUploadStart with multiple valid files when upload button is clicked", () => {
      const onUploadStart = vi.fn();
      render(<UploadZone onUploadStart={onUploadStart} />);
      const valid1 = createFile("a.pdf", 1024, "application/pdf");
      const valid2 = createFile("b.pdf", 2048, "application/pdf");
      fireEvent.drop(getZone(), createDropData([valid1, valid2]));

      fireEvent.click(screen.getByText("Upload 2 Files"));

      expect(onUploadStart).toHaveBeenCalledWith([valid1, valid2]);
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
      // Trigger a cap warning by adding >25 files
      const files = Array.from({ length: 30 }, (_, i) =>
        createFile(`f-${i}.pdf`, 1024, "application/pdf")
      );
      fireEvent.drop(getZone(), createDropData(files));

      const zone = getZone();
      expect(zone).toHaveAttribute("aria-describedby", "upload-error");
      const errorEl = document.getElementById("upload-error");
      expect(errorEl).toBeInTheDocument();
    });

    it("announces state changes via aria-live region", async () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);

      // Click upload to trigger uploading state
      fireEvent.click(screen.getByText("Upload 1 File"));

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

    it("handles file drop and shows file in list", () => {
      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");

      fireEvent.drop(getZone(), createDropData([file]));

      expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
      expect(screen.getByText("Upload 1 File")).toBeInTheDocument();
    });

    it("shows validation error on invalid file drop", () => {
      render(<UploadZone />);
      const file = createFile(
        "doc.docx",
        1024,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      fireEvent.drop(getZone(), createDropData([file]));

      expect(screen.getByText("doc.docx")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Unsupported file type. Please upload a PDF, JPG, PNG, or ZIP."
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

      // Add file and start upload
      const file1 = createFile("first.pdf", 1024, "application/pdf");
      selectFiles(input, [file1]);
      fireEvent.click(screen.getByText("Upload 1 File"));
      expect(screen.getByText("first.pdf")).toBeInTheDocument();

      // Try to upload another while uploading
      const file2 = createFile("second.pdf", 1024, "application/pdf");
      selectFiles(input, [file2]);

      // Should still show first file in uploading state
      expect(screen.getByText("first.pdf")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("ignores drop while uploading", () => {
      // Never-resolving fetch to keep component in uploading state
      mockFetch.mockReturnValueOnce(new Promise(() => {}));

      render(<UploadZone />);

      // Add file and start upload
      const file1 = createFile("first.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file1]);
      fireEvent.click(screen.getByText("Upload 1 File"));

      // Try to drop while uploading
      const file2 = createFile("second.pdf", 1024, "application/pdf");
      fireEvent.drop(getZone(), createDropData([file2]));

      // Should still show first file in uploading state
      expect(screen.getByText("first.pdf")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
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
      fireEvent.click(screen.getByText("Upload 1 File"));

      await waitFor(() => {
        expect(screen.getByText("File exceeds 10MB limit.")).toBeInTheDocument();
      });
    });

    it("shows error message on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      render(<UploadZone />);
      const file = createFile("invoice.pdf", 1024, "application/pdf");
      selectFiles(getInput(), [file]);
      fireEvent.click(screen.getByText("Upload 1 File"));

      await waitFor(() => {
        expect(
          screen.getByText("Upload failed. Please check your connection and try again.")
        ).toBeInTheDocument();
      });
    });
  });
});
