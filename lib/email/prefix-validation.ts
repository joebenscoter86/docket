const INBOUND_DOMAIN = "ingest.dockett.app";

export const RESERVED_PREFIXES = [
  "admin",
  "support",
  "invoices",
  "help",
  "info",
  "noreply",
  "billing",
  "test",
] as const;

type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validate a custom email prefix.
 * Rules:
 * - 3-20 characters
 * - Lowercase letters, numbers, and hyphens only (input is lowercased)
 * - No leading or trailing hyphens
 * - Not a reserved word
 */
export function validatePrefix(raw: string): ValidationResult {
  const prefix = raw.toLowerCase().trim();

  if (prefix.length < 3) {
    return { valid: false, error: "Prefix must be at least 3 characters." };
  }

  if (prefix.length > 20) {
    return { valid: false, error: "Prefix must be 20 characters or fewer." };
  }

  if (!/^[a-z0-9-]+$/.test(prefix)) {
    return {
      valid: false,
      error: "Prefix can only contain letters, numbers, and hyphens.",
    };
  }

  if (prefix.startsWith("-") || prefix.endsWith("-")) {
    return {
      valid: false,
      error: "Prefix cannot start or end with a hyphen.",
    };
  }

  if ((RESERVED_PREFIXES as readonly string[]).includes(prefix)) {
    return { valid: false, error: `"${prefix}" is reserved. Choose another prefix.` };
  }

  return { valid: true };
}

/**
 * Build a full inbound address from a validated prefix.
 */
export function buildAddress(prefix: string): string {
  return `${prefix.toLowerCase().trim()}@${INBOUND_DOMAIN}`;
}
