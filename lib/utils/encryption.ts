import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_TAG = 0x01;

function parseKey(hex: string, name: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `${name} must be exactly 32 bytes (64 hex characters), got ${key.length} bytes`
    );
  }
  return key;
}

function getCurrentKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return parseKey(hex, "ENCRYPTION_KEY");
}

function getPreviousKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (!hex) return null;
  return parseKey(hex, "ENCRYPTION_KEY_PREVIOUS");
}

function encryptWithKey(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: version (1 byte) + IV (12 bytes) + authTag (16 bytes) + ciphertext
  return Buffer.concat([Buffer.from([VERSION_TAG]), iv, authTag, encrypted]);
}

function decryptWithKey(combined: Buffer, key: Buffer): string {
  let offset = 0;

  // Check for version tag
  if (combined[0] === VERSION_TAG) {
    offset = 1; // skip version byte
  }
  // Version 0x00 (legacy, no tag): offset stays 0

  const minLength = offset + IV_LENGTH + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = combined.subarray(offset, offset + IV_LENGTH);
  const authTag = combined.subarray(
    offset + IV_LENGTH,
    offset + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = combined.subarray(offset + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function encrypt(plaintext: string): string {
  const key = getCurrentKey();
  const combined = encryptWithKey(plaintext, key);
  return combined.toString("base64");
}

export function decrypt(encoded: string): string {
  const combined = Buffer.from(encoded, "base64");

  // Try current key first
  const currentKey = getCurrentKey();
  try {
    return decryptWithKey(combined, currentKey);
  } catch {
    // Current key failed -- try previous key if available
  }

  const previousKey = getPreviousKey();
  if (!previousKey) {
    // No fallback key -- re-throw with current key to get the real error
    return decryptWithKey(combined, currentKey);
  }

  try {
    return decryptWithKey(combined, previousKey);
  } catch {
    // Both keys failed -- throw a clear error
    throw new Error(
      "Decryption failed: neither current nor previous encryption key could decrypt this data"
    );
  }
}
