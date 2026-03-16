"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type UploadState = "idle" | "dragging" | "uploading" | "success";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadZone() {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const timerIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach(clearTimeout);
    };
  }, []);

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

  const startMockUpload = useCallback(
    (file: File) => {
      setState("uploading");
      setError(null);
      setProgress(0);
      setFileName(file.name);
      setStatusAnnouncement(`Uploading ${file.name}`);

      timerIdsRef.current = [];
      const steps = [30, 60, 90, 100];
      steps.forEach((value, index) => {
        const id = setTimeout(() => {
          setProgress(value);
          if (value === 100) {
            setState("success");
            setStatusAnnouncement("Upload complete");
          }
        }, (index + 1) * 400);
        timerIdsRef.current.push(id);
      });
    },
    []
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

      startMockUpload(file);
    },
    [state, validateFile, startMockUpload]
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
          min-h-[200px] md:min-h-[300px]
          rounded-lg border-2 border-dashed
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
          p-4 md:p-8
          ${
            isDragging
              ? "border-accent bg-blue-50"
              : isUploading || isSuccess
              ? "border-gray-300 bg-white"
              : "border-gray-300 bg-white hover:border-accent cursor-pointer"
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
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-12 w-12 text-gray-400"
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
            <p className="text-sm font-medium text-gray-700">
              Drag & drop your invoice
            </p>
            <p className="text-sm text-gray-500">or click to browse</p>
            <p className="text-xs text-gray-400">
              PDF, JPG, or PNG up to 10MB
            </p>
          </div>
        )}

        {/* Dragging state */}
        {state === "dragging" && (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-12 w-12 text-accent"
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
            <p className="text-sm font-medium text-accent">
              Drop your file here
            </p>
          </div>
        )}

        {/* Uploading state */}
        {state === "uploading" && (
          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-sm font-medium text-gray-700">{fileName}</p>
            <div className="w-full max-w-xs">
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
              >
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">Uploading... {progress}%</p>
          </div>
        )}

        {/* Success state */}
        {state === "success" && (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-12 w-12 text-success"
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
            <p className="text-sm font-medium text-gray-700">{fileName}</p>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <p className="text-xs text-gray-500">Processing...</p>
            </div>
            <button
              type="button"
              className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={handleUploadAnother}
            >
              Upload Another
            </button>
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
