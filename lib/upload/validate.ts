const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024; // 50MB

type SupportedMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "application/zip"
  | "application/x-zip-compressed";

interface MagicByteSignature {
  bytes: number[];
  mimeType: SupportedMimeType;
}

const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04];

const SIGNATURES: MagicByteSignature[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf" },  // %PDF
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg" },             // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png" },        // PNG
  { bytes: ZIP_MAGIC_BYTES, mimeType: "application/zip" },            // ZIP (PK\x03\x04)
];

// application/x-zip-compressed is a browser alias for application/zip —
// treat it as equivalent in the supported set and during match validation.
const SUPPORTED_TYPES = new Set<string>([
  ...SIGNATURES.map((s) => s.mimeType),
  "application/x-zip-compressed",
]);

interface ValidationResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
}

export function isZipFile(buffer: Buffer): boolean {
  if (buffer.length < ZIP_MAGIC_BYTES.length) return false;
  return ZIP_MAGIC_BYTES.every((byte, i) => buffer[i] === byte);
}

export function validateFileMagicBytes(
  buffer: Buffer,
  claimedType: string
): ValidationResult {
  if (!SUPPORTED_TYPES.has(claimedType)) {
    return { valid: false, error: "Unsupported file type." };
  }

  if (buffer.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  // Normalize the zip alias so the match comparison below works uniformly.
  const normalizedClaimed =
    claimedType === "application/x-zip-compressed"
      ? "application/zip"
      : claimedType;

  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    const match = sig.bytes.every((byte, i) => buffer[i] === byte);
    if (match) {
      if (sig.mimeType === normalizedClaimed) {
        return { valid: true, detectedType: sig.mimeType };
      }
      return {
        valid: false,
        error: `File content does not match claimed type. Detected: ${sig.mimeType}, claimed: ${claimedType}`,
      };
    }
  }

  return { valid: false, error: "File content does not match expected type." };
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE;
}
