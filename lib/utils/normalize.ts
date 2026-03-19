/**
 * Normalize a string for matching: lowercase, trim, collapse whitespace.
 * Used for GL account mapping lookups (vendor names and line item descriptions).
 */
export function normalizeForMatching(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}
