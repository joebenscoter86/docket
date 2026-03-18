"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Button from "@/components/ui/Button";

type UploadState = "idle" | "dragging" | "uploading" | "success";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadZoneProps {
  onUploadComplete?: (invoiceId: string) => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate progress smoothly while uploading
  useEffect(() => {
    if (state === "uploading") {
      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          // Ease toward 90% but never reach it — the final jump to 100%
          // happens when the API responds
          if (prev >= 90) return prev;
          // Fast at first, slows down as it approaches 90
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

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
      }
      if (file.size > MAX_FILE_SIZE) {
        return "File exceeds 10MB limit.";
      }
      return null;
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setState("uploading");
      setError(null);
      setProgress(0);
      setFileName(file.name);
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
        // Notify parent with invoiceId for realtime tracking
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
      if (fileArray.length > 1) {
        setError("Please upload one file at a time.");
        setState("idle");
        return;
      }
      if (fileArray.length === 0) return;

      const file = fileArray[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setState("idle");
        return;
      }

      uploadFile(file);
    },
    [state, validateFile, uploadFile]
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
      setProgress(0);
      setFileName(null);
      setStatusAnnouncement("");
    },
    []
  );

  const isDragging = state === "dragging";
  const isUploading = state === "uploading";
  const isSuccess = state === "success";

  return (
    <div>
      <div
        ref={zoneRef}
        role="button"
        tabIndex={0}
        aria-label="Upload invoice file"
        aria-describedby={error ? "upload-error" : undefined}
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
          accept=".pdf,.jpg,.jpeg,.png"
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
              PDF, PNG, JPG up to 10MB
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

      {/* Error message */}
      {error && (
        <p id="upload-error" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {/* Accessible live region */}
      <div aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
    </div>
  );
}
