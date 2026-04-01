"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Button from "@/components/ui/Button";
import type { DuplicateWarning } from "@/lib/types/invoice";

type UploadState = "idle" | "dragging" | "uploading" | "success";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-zip-compressed",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (non-zip)
const MAX_ZIP_SIZE = 50 * 1024 * 1024;  // 50MB (zip)
const MAX_FILES = 25;

interface SelectedFile {
  file: File;
  id: string;
  valid: boolean;
  error?: string;
}

interface UploadZoneProps {
  onUploadComplete?: (invoiceId: string) => void;
  onUploadStart?: (files: File[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isZipByExtension(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

function validateFile(file: File): string | null {
  // For .zip files, always accept regardless of browser-reported MIME type.
  // macOS drag-and-drop reports inconsistent MIME types for zips.
  // Server validates by magic bytes anyway.
  const isZip = isZipByExtension(file.name);
  if (!isZip && !ACCEPTED_TYPES.includes(file.type)) {
    return "Unsupported file type. Please upload a PDF, JPG, PNG, or ZIP.";
  }
  const limit = isZip ? MAX_ZIP_SIZE : MAX_FILE_SIZE;
  if (file.size > limit) {
    return isZip ? "Zip file exceeds 50MB limit." : "File exceeds 10MB limit.";
  }
  return null;
}

export default function UploadZone({ onUploadComplete, onUploadStart }: UploadZoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [capWarning, setCapWarning] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate progress smoothly while uploading
  useEffect(() => {
    if (state === "uploading") {
      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          const increment = Math.max(0.5, (90 - prev) * 0.08);
          return Math.min(90, prev + increment);
        });
      }, 100);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [state]);

  const uploadFile = useCallback(
    async (file: File) => {
      setState("uploading");
      setError(null);
      setCapWarning(null);
      setDuplicateWarning(null);
      setProgress(0);
      setFileName(file.name);
      setSelectedFiles([]);
      setStatusAnnouncement(`Uploading ${file.name}`);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/invoices/upload", {
          method: "POST",
          body: formData,
        });

        const body = await response.json();

        if (!response.ok) {
          setState("idle");
          setError(body.error || "Upload failed. Please try again.");
          setStatusAnnouncement("Upload failed");
          return;
        }

        setProgress(100);
        setState("success");
        setStatusAnnouncement("Upload complete");
        if (body.data?.duplicateWarning) {
          setDuplicateWarning(body.data.duplicateWarning);
        }
        if (onUploadComplete && body.data?.invoiceId) {
          onUploadComplete(body.data.invoiceId);
        }
      } catch {
        setState("idle");
        setError("Upload failed. Please check your connection and try again.");
        setStatusAnnouncement("Upload failed");
      }
    },
    [onUploadComplete]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      if (state === "uploading") return;

      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const filesToProcess = fileArray;

      setError(null);
      setCapWarning(null);

      const newEntries: SelectedFile[] = filesToProcess.map((file) => {
        const validationError = validateFile(file);
        return {
          file,
          id: crypto.randomUUID(),
          valid: validationError === null,
          error: validationError ?? undefined,
        };
      });

      setSelectedFiles((prev) => {
        const remaining = MAX_FILES - prev.length;
        if (remaining <= 0) return prev;
        const accepted = newEntries.slice(0, remaining);
        if (newEntries.length > remaining) {
          const rejected = newEntries.length - remaining;
          setCapWarning(`Maximum ${MAX_FILES} files allowed. ${rejected} file${rejected > 1 ? "s were" : " was"} not added.`);
        }
        return [...prev, ...accepted];
      });
      setState("idle");
    },
    [state]
  );

  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
    setCapWarning(null);
  }, []);

  const validFiles = selectedFiles.filter((f) => f.valid);
  const validCount = validFiles.length;

  const handleUploadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const filesToUpload = selectedFiles.filter((f) => f.valid).map((f) => f.file);
      if (filesToUpload.length === 0) return;

      const hasZip = filesToUpload.some(
        (f) => f.type === "application/zip" || f.type === "application/x-zip-compressed" || isZipByExtension(f.name)
      );

      if ((filesToUpload.length > 1 || hasZip) && onUploadStart) {
        // Multiple files or zip: use batch upload flow
        onUploadStart(filesToUpload);
      } else {
        // Single non-zip file: use inline upload + onUploadComplete path
        uploadFile(filesToUpload[0]);
      }
    },
    [selectedFiles, onUploadStart, uploadFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (state === "uploading") return;
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
      // Reset input value so same file can be re-selected
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [handleFiles, state]
  );

  const handleClick = useCallback(() => {
    if (state === "uploading") return;
    inputRef.current?.click();
  }, [state]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (state === "uploading") return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputRef.current?.click();
        // Keep focus on zone
        zoneRef.current?.focus();
      }
    },
    [state]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (state === "uploading") return;
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setState("dragging");
      }
    },
    [state]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (state === "uploading") return;
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setState("idle");
      }
    },
    [state]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;

      if (state === "uploading") return;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFiles(Array.from(files));
      }
    },
    [handleFiles, state]
  );

  const handleUploadAnother = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setState("idle");
      setError(null);
      setCapWarning(null);
      setDuplicateWarning(null);
      setProgress(0);
      setFileName(null);
      setStatusAnnouncement("");
      setSelectedFiles([]);
    },
    []
  );

  const isDragging = state === "dragging";
  const isUploading = state === "uploading";
  const isSuccess = state === "success";
  const hasError = !!(error || capWarning);

  const uploadButtonText =
    validCount === 0
      ? "No valid files to upload"
      : validCount === 1
      ? "Upload 1 File"
      : `Upload ${validCount} Files`;

  return (
    <div>
      <div
        ref={zoneRef}
        role="button"
        tabIndex={0}
        aria-label="Upload invoice file"
        aria-describedby={hasError ? "upload-error" : undefined}
        className={`
          relative flex flex-col items-center justify-center
          w-[80%] mx-auto min-h-[360px]
          rounded-brand-lg border-2 border-dashed
          shadow-soft
          focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
          p-4 md:p-8
          ${
            isDragging
              ? "border-primary border-solid bg-[#EFF6FF] scale-[1.02] transition-all duration-150 ease-in-out"
              : isUploading || isSuccess
              ? "border-border bg-surface transition-all duration-150 ease-in-out"
              : "border-[#CBD5E1] bg-surface hover:border-primary cursor-pointer transition-all duration-150 ease-in-out"
          }
        `}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.zip"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />

        {/* Idle state */}
        {state === "idle" && (
          <div className="flex flex-col items-center gap-4">
            <svg
              className="h-14 w-14 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 4.502 4.502 0 013.516 5.307A4.5 4.5 0 0118 19.5H6.75z"
              />
            </svg>
            <p className="font-headings font-bold text-2xl text-text">
              Drag & drop invoices here
            </p>
            <p className="font-body text-sm text-muted">
              PDF, PNG, JPG, or ZIP up to 10MB (ZIP up to 50MB)
            </p>
            <p className="font-body text-sm text-muted">
              <span className="font-bold">Upload up to 25 files at a time</span>
            </p>
            <Button
              variant="primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Browse Files
            </Button>
          </div>
        )}

        {/* Dragging state */}
        {state === "dragging" && (
          <div className="flex flex-col items-center gap-4">
            <svg
              className="h-14 w-14 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 4.502 4.502 0 013.516 5.307A4.5 4.5 0 0118 19.5H6.75z"
              />
            </svg>
            <p className="font-headings font-bold text-2xl text-primary">
              Drop your file here
            </p>
          </div>
        )}

        {/* Uploading state */}
        {state === "uploading" && (
          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-sm font-medium text-text">{fileName}</p>
            <div className="w-full max-w-xs">
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-background"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${progress >= 100 ? "bg-accent" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted">Uploading... {progress}%</p>
          </div>
        )}

        {/* Success state */}
        {state === "success" && (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-12 w-12 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-accent font-medium text-sm">{fileName}</p>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <p className="text-xs text-muted">Processing...</p>
            </div>
            {duplicateWarning && (
              <div
                className="flex items-start gap-2 rounded-brand-md bg-amber-50 border border-amber-200 px-3 py-2 max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-800">{duplicateWarning.message}</p>
                  {duplicateWarning.matches.slice(0, 2).map((m) => (
                    <a
                      key={m.invoiceId}
                      href={`/invoices/${m.invoiceId}/review`}
                      className="text-xs text-amber-700 underline hover:text-amber-900 block truncate"
                    >
                      {m.fileName} ({m.status})
                    </a>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant="outline"
              type="button"
              onClick={handleUploadAnother}
            >
              Upload Another
            </Button>
          </div>
        )}
      </div>

      {/* File list */}
      {selectedFiles.length > 0 && state === "idle" && (
        <div className="w-[80%] mx-auto mt-4 space-y-2">
          {selectedFiles.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-brand-md ${
                entry.valid ? "bg-white" : "bg-red-50"
              }`}
            >
              {/* Validation icon */}
              {entry.valid ? (
                <svg
                  className="h-5 w-5 flex-shrink-0 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 flex-shrink-0 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm truncate ${
                    entry.valid ? "text-text" : "text-text line-through"
                  }`}
                >
                  {entry.file.name}
                </p>
                {entry.error && (
                  <p className="text-xs text-error">{entry.error}</p>
                )}
              </div>

              {/* File size */}
              <span className="text-xs text-muted flex-shrink-0">
                {formatFileSize(entry.file.size)}
              </span>

              {/* Remove button */}
              <button
                type="button"
                aria-label={`Remove ${entry.file.name}`}
                className="text-muted hover:text-text flex-shrink-0 p-1 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(entry.id);
                }}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* Upload button */}
          <div className="pt-2">
            <Button
              variant="primary"
              type="button"
              disabled={validCount === 0}
              onClick={handleUploadClick}
            >
              {uploadButtonText}
            </Button>
          </div>
        </div>
      )}

      {/* Error / cap warning message */}
      {hasError && (
        <p id="upload-error" className="mt-2 text-sm text-error w-[80%] mx-auto">
          {error || capWarning}
        </p>
      )}

      {/* Accessible live region */}
      <div aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
    </div>
  );
}
