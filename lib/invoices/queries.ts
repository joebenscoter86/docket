import {
  InvoiceListParams,
  VALID_STATUSES,
  VALID_SORTS,
  VALID_DIRECTIONS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./types";

// --- Cursor helpers ---

/**
 * Encodes a sort value and invoice ID into a base64 cursor for pagination.
 * The cursor contains the sort field value and the invoice ID.
 * @param sortValue - The value of the sort field (string, number, or null)
 * @param id - The invoice ID
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(
  sortValue: string | number | null,
  id: string
): string {
  return Buffer.from(JSON.stringify({ s: sortValue, id })).toString("base64");
}

/**
 * Decodes a base64 cursor back into sort value and invoice ID.
 * Returns null if the cursor is invalid or malformed.
 * @param cursor - Base64-encoded cursor string
 * @returns Decoded cursor object or null if invalid
 */
export function decodeCursor(
  cursor: string | undefined
): { sortValue: string | number | null; id: string } | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    // Validate required fields
    if (typeof parsed.id !== "string" || !("s" in parsed)) return null;
    return { sortValue: parsed.s, id: parsed.id };
  } catch {
    return null;
  }
}

// --- Param validation ---

/**
 * Validates and normalizes invoice list query parameters.
 * Falls back to defaults for invalid values.
 * @param params - Raw query parameters
 * @returns Validated parameters with defaults applied
 */
export function validateListParams(params: InvoiceListParams) {
  // Validate status
  const status =
    params.status &&
    VALID_STATUSES.includes(params.status as (typeof VALID_STATUSES)[number])
      ? (params.status as (typeof VALID_STATUSES)[number])
      : "all";

  // Validate sort
  const sort =
    params.sort &&
    VALID_SORTS.includes(params.sort as (typeof VALID_SORTS)[number])
      ? (params.sort as (typeof VALID_SORTS)[number])
      : "uploaded_at";

  // Validate direction
  const direction =
    params.direction &&
    VALID_DIRECTIONS.includes(
      params.direction as (typeof VALID_DIRECTIONS)[number]
    )
      ? (params.direction as (typeof VALID_DIRECTIONS)[number])
      : "desc";

  // Validate and clamp limit
  let limit = typeof params.limit === "number" ? params.limit : DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(limit, MAX_LIMIT));

  return {
    status,
    sort,
    direction,
    cursor: params.cursor,
    limit,
  };
}
