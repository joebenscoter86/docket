const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type SupportedMimeType = "application/pdf" | "image/jpeg" | "image/png";

interface MagicByteSignature {
  bytes: number[];
  mimeType: SupportedMimeType;
}

const SIGNATURES: MagicByteSignature[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf" },  // %PDF
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg" },             // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png" },        // PNG
];

const SUPPORTED_TYPES = new Set<string>(
  SIGNATURES.map((s) => s.mimeType)
);

interface ValidationResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
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

  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    const match = sig.bytes.every((byte, i) => buffer[i] === byte);
    if (match) {
      if (sig.mimeType === claimedType) {
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
