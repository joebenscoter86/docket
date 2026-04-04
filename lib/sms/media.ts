import { validateFileMagicBytes, validateFileSize } from "@/lib/upload/validate";
import { logger } from "@/lib/utils/logger";

const HEIC_FTYP_SIGNATURES = ["heic", "heix", "hevc", "mif1"];

export interface SmsMediaAttachment {
  filename: string;
  content: Buffer;
  detectedType: string;
  sizeBytes: number;
}

interface FetchResult {
  valid: SmsMediaAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
}

function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ftypStr = buffer.subarray(4, 8).toString("ascii");
  if (ftypStr !== "ftyp") return false;
  const brand = buffer.subarray(8, 12).toString("ascii");
  return HEIC_FTYP_SIGNATURES.includes(brand);
}

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer).jpeg({ quality: 95 }).toBuffer();
}

export async function fetchSmsMedia(params: {
  numMedia: number;
  getMediaUrl: (i: number) => string;
  getMediaContentType: (i: number) => string;
  maxAttachments?: number;
}): Promise<FetchResult> {
  const { numMedia, getMediaUrl, getMediaContentType, maxAttachments = 5 } = params;
  const valid: SmsMediaAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const count = Math.min(numMedia, maxAttachments);

  for (let i = 0; i < count; i++) {
    const mediaUrl = getMediaUrl(i);
    const claimedType = getMediaContentType(i);
    const filename = `sms-attachment-${i}.${extensionFromMime(claimedType)}`;

    try {
      const response = await fetch(mediaUrl, {
        headers: { Authorization: authHeader },
        redirect: "follow",
      });

      if (!response.ok) {
        rejected.push({ filename, reason: `Fetch failed: HTTP ${response.status}` });
        continue;
      }

      let buffer: Buffer = Buffer.from(new Uint8Array(await response.arrayBuffer()));
      const sizeBytes = buffer.length;

      if (!validateFileSize(sizeBytes)) {
        rejected.push({ filename, reason: "File exceeds 10MB limit" });
        continue;
      }

      if (isHeic(buffer)) {
        try {
          buffer = await convertHeicToJpeg(buffer);
          logger.info("sms_heic_converted", {
            action: "fetch_sms_media",
            originalSize: sizeBytes,
            convertedSize: buffer.length,
          });
        } catch (err) {
          rejected.push({
            filename,
            reason: `HEIC conversion failed: ${err instanceof Error ? err.message : "unknown"}`,
          });
          continue;
        }
        const validation = validateFileMagicBytes(buffer, "image/jpeg");
        if (!validation.valid) {
          rejected.push({ filename, reason: validation.error ?? "Invalid after HEIC conversion" });
          continue;
        }
        valid.push({
          filename: filename.replace(/\.\w+$/, ".jpg"),
          content: buffer,
          detectedType: "image/jpeg",
          sizeBytes: buffer.length,
        });
        continue;
      }

      const validation = validateFileMagicBytes(buffer, claimedType);
      if (!validation.valid) {
        rejected.push({ filename, reason: validation.error ?? "Magic bytes mismatch" });
        continue;
      }

      valid.push({
        filename,
        content: buffer,
        detectedType: validation.detectedType!,
        sizeBytes,
      });
    } catch (err) {
      rejected.push({
        filename,
        reason: `Fetch error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  if (numMedia > maxAttachments) {
    rejected.push({
      filename: `attachments ${maxAttachments + 1}-${numMedia}`,
      reason: `Only ${maxAttachments} attachments per message are supported`,
    });
  }

  return { valid, rejected };
}

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return map[mimeType] ?? "bin";
}
