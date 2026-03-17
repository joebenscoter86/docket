"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.0;

interface PdfViewerProps {
  signedUrl: string;
  fileType: string;
}

type LoadingState = "loading" | "loaded" | "error";

// ─── Toolbar ────────────────────────────────────────────────

function ViewerToolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  currentPage,
  numPages,
  isPdf,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  currentPage: number;
  numPages: number;
  isPdf: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          aria-label="Zoom out"
          onClick={onZoomOut}
          disabled={scale <= MIN_SCALE}
          className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
          </svg>
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium text-gray-700">
          {Math.round(scale * 100)}%
        </span>
        <button
          aria-label="Zoom in"
          onClick={onZoomIn}
          disabled={scale >= MAX_SCALE}
          className="rounded p-1 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <button
          aria-label="Reset zoom"
          onClick={onResetZoom}
          className="ml-1 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          Fit
        </button>
      </div>
      {isPdf && numPages > 0 && (
        <span className="text-xs text-gray-500">
          Page {currentPage} of {numPages}
        </span>
      )}
    </div>
  );
}

// ─── Loading State ──────────────────────────────────────────

function LoadingIndicator() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center animate-pulse">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="mx-auto h-12 w-12 text-gray-300">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p className="mt-2 text-sm text-gray-400">Loading document...</p>
      </div>
    </div>
  );
}

// ─── Error State ────────────────────────────────────────────

function ErrorIndicator() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="mx-auto h-12 w-12 text-red-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="mt-2 text-sm font-medium text-gray-700">Unable to load document</p>
        <p className="mt-1 text-xs text-gray-500">The file may have expired or is unavailable.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function PdfViewer({ signedUrl, fileType }: PdfViewerProps) {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const ratioMap = useRef<Map<number, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const isPdf = fileType === "application/pdf";

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(DEFAULT_SCALE);
  }, []);

  // Keyboard zoom: Ctrl/Cmd + scroll wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
        } else {
          setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // IntersectionObserver for current page tracking
  useEffect(() => {
    if (!isPdf || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute("data-page-number"));
          if (!isNaN(pageNum)) {
            ratioMap.current.set(pageNum, entry.intersectionRatio);
          }
        });

        // Find the page with the highest intersection ratio
        let maxRatio = 0;
        let maxPage = 1;
        ratioMap.current.forEach((ratio, page) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            maxPage = page;
          }
        });
        setCurrentPage(maxPage);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1.0] }
    );

    pageRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isPdf, numPages, scale]);

  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el);
    } else {
      pageRefs.current.delete(pageNum);
    }
  }, []);

  // ── PDF view ──

  if (isPdf) {
    return (
      <div className="flex h-full flex-col">
        <ViewerToolbar
          scale={scale}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          currentPage={currentPage}
          numPages={numPages}
          isPdf
        />
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100">
          <Document
            file={signedUrl}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setLoadingState("loaded");
            }}
            onLoadError={() => {
              setLoadingState("error");
            }}
          >
            {loadingState === "loading" ? (
              <LoadingIndicator />
            ) : loadingState === "error" ? (
              <ErrorIndicator />
            ) : (
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={(el) => setPageRef(pageNum, el)}
                  data-page-number={pageNum}
                  className="flex justify-center py-2"
                >
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              ))
            )}
          </Document>
        </div>
      </div>
    );
  }

  // ── Image view ──

  return (
    <div className="flex h-full flex-col">
      <ViewerToolbar
        scale={scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        currentPage={1}
        numPages={0}
        isPdf={false}
      />
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100">
        {loadingState === "error" ? (
          <ErrorIndicator />
        ) : (
          <>
            {loadingState === "loading" && <LoadingIndicator />}
            <div className="flex justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- Signed URLs from Supabase Storage; next/image requires pre-configured remote patterns */}
              <img
                src={signedUrl}
                alt="Invoice document"
                onLoad={() => setLoadingState("loaded")}
                onError={() => setLoadingState("error")}
                style={{
                  width: `${scale * 100}%`,
                  maxWidth: "none",
                }}
                className={loadingState === "loading" ? "hidden" : ""}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
