import JSZip from "jszip";
import { validateFileSize, MAX_UNCOMPRESSED_SIZE } from "./validate";

export interface ExtractedZipFile {
  name: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface SkippedZipFile {
  name: string;
  reason: string;
}

export interface ZipExtractionResult {
  files: ExtractedZipFile[];
  skipped: SkippedZipFile[];
}

// Detect mime type from magic bytes (only supported invoice types)
function detectMimeType(buffer: Buffer): string | null {
  const signatures: Array<{ bytes: number[]; mimeType: string }> = [
    { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf" },
    { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg" },
    { bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png" },
  ];

  for (const sig of signatures) {
    if (buffer.length < sig.bytes.length) continue;
    if (sig.bytes.every((byte, i) => buffer[i] === byte)) {
      return sig.mimeType;
    }
  }
  return null;
}

// Extract basename from path, handling both / and \ separators
function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1];
}

// Deduplicate filenames by appending (1), (2), etc.
function deduplicateNames(files: Array<{ name: string }>): void {
  const seen = new Map<string, number>();
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const count = seen.get(lower) ?? 0;
    if (count > 0) {
      const ext = file.name.lastIndexOf(".");
      if (ext > 0) {
        file.name = `${file.name.slice(0, ext)} (${count})${file.name.slice(ext)}`;
      } else {
        file.name = `${file.name} (${count})`;
      }
    }
    seen.set(lower, count + 1);
  }
}

export async function extractZipFiles(zipBuffer: Buffer): Promise<ZipExtractionResult> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length === 0) {
    throw new Error("Zip file is empty.");
  }

  let totalSize = 0;
  const files: ExtractedZipFile[] = [];
  const skipped: SkippedZipFile[] = [];

  for (const entry of entries) {
    const name = basename(entry.name);

    // Skip hidden files (macOS __MACOSX, .DS_Store, etc.)
    if (name.startsWith(".") || entry.name.includes("__MACOSX")) {
      continue;
    }

    const buffer = Buffer.from(await entry.async("arraybuffer"));
    totalSize += buffer.length;

    if (totalSize > MAX_UNCOMPRESSED_SIZE) {
      throw new Error(
        "Zip contents exceed 50MB uncompressed limit. Please split into smaller uploads."
      );
    }

    // Check per-file size
    if (!validateFileSize(buffer.length)) {
      skipped.push({ name, reason: "File exceeds 10MB limit." });
      continue;
    }

    // Detect file type by magic bytes
    const mimeType = detectMimeType(buffer);
    if (!mimeType) {
      skipped.push({ name, reason: "Unsupported file type. Only PDF, JPG, and PNG are accepted." });
      continue;
    }

    files.push({ name, buffer, mimeType, sizeBytes: buffer.length });
  }

  // Deduplicate filenames from different folders
  deduplicateNames(files);

  return { files, skipped };
}
