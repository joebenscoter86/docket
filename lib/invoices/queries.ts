import { SupabaseClient } from "@supabase/supabase-js";
import {
  InvoiceListItem,
  InvoiceListCounts,
  InvoiceListParams,
  VALID_STATUSES,
  VALID_SORTS,
  VALID_DIRECTIONS,
  VALID_OUTPUT_TYPES,
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

  // Validate output_type
  const output_type =
    params.output_type &&
    VALID_OUTPUT_TYPES.includes(
      params.output_type as (typeof VALID_OUTPUT_TYPES)[number]
    )
      ? (params.output_type as (typeof VALID_OUTPUT_TYPES)[number])
      : "all";

  // Validate and clamp limit
  let limit = typeof params.limit === "number" ? params.limit : DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(limit, MAX_LIMIT));

  return {
    status,
    sort,
    direction,
    cursor: params.cursor,
    limit,
    output_type,
  };
}

// --- Sort column mapping ---

const SORT_COLUMN_MAP: Record<
  string,
  { column: string; table: "invoices" | "extracted_data" }
> = {
  uploaded_at: { column: "uploaded_at", table: "invoices" },
  invoice_date: { column: "invoice_date", table: "extracted_data" },
  vendor_name: { column: "vendor_name", table: "extracted_data" },
  total_amount: { column: "total_amount", table: "extracted_data" },
};

// --- Fetch counts ---

export async function fetchInvoiceCounts(
  supabase: SupabaseClient
): Promise<InvoiceListCounts> {
  const { data, error } = await supabase.rpc("invoice_counts_by_status");

  if (error || !data) {
    return { all: 0, pending_review: 0, approved: 0, synced: 0, error: 0 };
  }

  const counts: InvoiceListCounts = {
    all: 0,
    pending_review: 0,
    approved: 0,
    synced: 0,
    error: 0,
  };
  let total = 0;

  for (const row of data as { status: string; count: number }[]) {
    total += row.count;
    if (row.status in counts && row.status !== "all") {
      counts[row.status as keyof Omit<InvoiceListCounts, "all">] = row.count;
    }
  }

  counts.all = total;
  return counts;
}

// --- Fetch invoice list ---

interface ValidatedParams {
  status: string;
  sort: string;
  direction: string;
  cursor?: string;
  limit: number;
  output_type: string;
}

export async function fetchInvoiceList(
  supabase: SupabaseClient,
  params: ValidatedParams
): Promise<{ invoices: InvoiceListItem[]; nextCursor: string | null }> {
  const { status, sort, direction, cursor, limit, output_type } = params;
  const sortConfig = SORT_COLUMN_MAP[sort] ?? SORT_COLUMN_MAP.uploaded_at;

  let query = supabase.from("invoices").select(`
      id,
      file_name,
      status,
      uploaded_at,
      output_type,
      extracted_data (
        vendor_name,
        invoice_number,
        invoice_date,
        total_amount
      )
    `);

  // Status filter
  if (status !== "all") {
    query = query.eq("status", status);
  }

  // Output type filter
  if (output_type !== "all") {
    query = query.eq("output_type", output_type);
  }

  // Cursor pagination — always keyed on (uploaded_at, id) regardless of display sort.
  const decodedCursor = decodeCursor(cursor);
  if (decodedCursor) {
    const { sortValue, id } = decodedCursor;
    const ascending = direction === "asc";

    if (ascending) {
      query = query.or(
        `uploaded_at.gt.${sortValue},and(uploaded_at.eq.${sortValue},id.gt.${id})`
      );
    } else {
      query = query.or(
        `uploaded_at.lt.${sortValue},and(uploaded_at.eq.${sortValue},id.lt.${id})`
      );
    }
  }

  // Sort order
  if (sortConfig.table === "invoices") {
    query = query.order(sortConfig.column, {
      ascending: direction === "asc",
    });
  } else {
    query = query.order(sortConfig.column, {
      ascending: direction === "asc",
      referencedTable: "extracted_data",
      nullsFirst: direction === "asc",
    });
    query = query.order("uploaded_at", { ascending: false });
  }

  // Always add id as final tiebreaker for stable ordering
  query = query.order("id", { ascending: direction === "asc" });

  // Fetch limit + 1 to detect next page
  query = query.limit(limit + 1);

  const { data, error } = await query;

  if (error || !data) {
    return { invoices: [], nextCursor: null };
  }

  const hasNextPage = data.length > limit;
  const rows = hasNextPage ? data.slice(0, limit) : data;

  const invoices: InvoiceListItem[] = rows.map(
    (row: Record<string, unknown>) => {
      const extracted = Array.isArray(row.extracted_data)
        ? (row.extracted_data[0] ?? null)
        : (row.extracted_data ?? null);

      return {
        id: row.id as string,
        file_name: row.file_name as string,
        status: row.status as InvoiceListItem["status"],
        uploaded_at: row.uploaded_at as string,
        output_type: (row.output_type as InvoiceListItem["output_type"]) ?? null,
        extracted_data: extracted
          ? {
              vendor_name: (extracted as Record<string, unknown>).vendor_name as string | null,
              invoice_number: (extracted as Record<string, unknown>).invoice_number as string | null,
              invoice_date: (extracted as Record<string, unknown>).invoice_date as string | null,
              total_amount: (extracted as Record<string, unknown>).total_amount as number | null,
            }
          : null,
      };
    }
  );

  let nextCursor: string | null = null;
  if (hasNextPage) {
    const lastInvoice = rows[rows.length - 1] as Record<string, unknown>;
    nextCursor = encodeCursor(
      lastInvoice.uploaded_at as string,
      lastInvoice.id as string
    );
  }

  return { invoices, nextCursor };
}
