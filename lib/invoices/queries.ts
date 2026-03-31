import { SupabaseClient } from "@supabase/supabase-js";
import { InvoiceStatus } from "@/lib/types/invoice";
import {
  InvoiceListItem,
  InvoiceListCounts,
  InvoiceListParams,
  VALID_STATUSES,
  VALID_SORTS,
  VALID_DIRECTIONS,
  VALID_OUTPUT_TYPES,
  VALID_DATE_FIELDS,
  VALID_DATE_PRESETS,
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

  // Validate batch_id — must be a valid UUID format if present
  const batch_id =
    params.batch_id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      params.batch_id
    )
      ? params.batch_id
      : undefined;

  // Validate date_field
  const date_field =
    params.date_field &&
    VALID_DATE_FIELDS.includes(params.date_field as (typeof VALID_DATE_FIELDS)[number])
      ? (params.date_field as (typeof VALID_DATE_FIELDS)[number])
      : "uploaded_at";

  // Validate date_preset
  const date_preset =
    params.date_preset &&
    VALID_DATE_PRESETS.includes(params.date_preset as (typeof VALID_DATE_PRESETS)[number])
      ? (params.date_preset as (typeof VALID_DATE_PRESETS)[number])
      : undefined;

  // Resolve preset to date range, or use explicit from/to
  let date_from: string | undefined;
  let date_to: string | undefined;

  if (date_preset) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (date_preset === "today") {
      date_from = todayStr;
      date_to = todayStr;
    } else if (date_preset === "week") {
      const day = now.getUTCDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setUTCDate(now.getUTCDate() - mondayOffset);
      date_from = monday.toISOString().slice(0, 10);
      date_to = todayStr;
    } else if (date_preset === "month") {
      date_from = `${todayStr.slice(0, 7)}-01`;
      date_to = todayStr;
    }
  } else {
    // Validate explicit date strings (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    date_from = params.date_from && dateRegex.test(params.date_from) ? params.date_from : undefined;
    date_to = params.date_to && dateRegex.test(params.date_to) ? params.date_to : undefined;
  }

  return {
    status,
    sort,
    direction,
    cursor: params.cursor,
    limit,
    output_type,
    batch_id,
    date_field,
    date_preset,
    date_from,
    date_to,
  };
}

// --- Sort column mapping ---
// With the invoice_list_view, all sort columns are top-level.
// No referencedTable needed.
const VALID_SORT_COLUMNS = ["uploaded_at", "invoice_date", "vendor_name", "total_amount"] as const;

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
  batch_id?: string;
  date_field: string;
  date_preset?: string;
  date_from?: string;
  date_to?: string;
}

export async function fetchInvoiceList(
  supabase: SupabaseClient,
  params: ValidatedParams
): Promise<{ invoices: InvoiceListItem[]; nextCursor: string | null }> {
  const { status, sort, direction, cursor, limit, output_type, batch_id, date_field, date_from, date_to } = params;
  const sortColumn = VALID_SORT_COLUMNS.includes(sort as (typeof VALID_SORT_COLUMNS)[number])
    ? sort
    : "uploaded_at";

  let query = supabase.from("invoice_list_view").select(`
      id,
      file_name,
      status,
      uploaded_at,
      output_type,
      batch_id,
      source,
      email_sender,
      error_message,
      vendor_name,
      invoice_number,
      invoice_date,
      total_amount
    `);

  // Status filter
  if (status !== "all") {
    query = query.eq("status", status);
  }

  // Always exclude archived invoices from the list
  query = query.neq("status", "archived");

  // Output type filter
  if (output_type !== "all") {
    query = query.eq("output_type", output_type);
  }

  // Batch filter
  if (batch_id) {
    query = query.eq("batch_id", batch_id);
  }

  // Date range filter
  if (date_from) {
    if (date_field === "invoice_date") {
      // invoice_date is a DATE column, compare directly
      query = query.gte("invoice_date", date_from);
    } else {
      // uploaded_at is a TIMESTAMPTZ column
      query = query.gte("uploaded_at", `${date_from}T00:00:00.000Z`);
    }
  }
  if (date_to) {
    if (date_field === "invoice_date") {
      query = query.lte("invoice_date", date_to);
    } else {
      query = query.lte("uploaded_at", `${date_to}T23:59:59.999Z`);
    }
  }

  // Cursor pagination keyed on (sort_column, id)
  const decodedCursor = decodeCursor(cursor);
  if (decodedCursor) {
    const { sortValue, id } = decodedCursor;
    const ascending = direction === "asc";
    const gt = ascending ? "gt" : "lt";
    const eq = "eq";

    query = query.or(
      `${sortColumn}.${gt}.${sortValue},and(${sortColumn}.${eq}.${sortValue},id.${gt}.${id})`
    );
  }

  // Sort order -- all columns are top-level in the view
  query = query.order(sortColumn, {
    ascending: direction === "asc",
    nullsFirst: direction === "asc",
  });

  // Always add id as final tiebreaker for stable ordering
  query = query.order("id", { ascending: direction === "asc" });

  // Fetch limit + 1 to detect next page (skip when filtering by batch)
  if (!batch_id) {
    query = query.limit(limit + 1);
  }

  const { data, error } = await query;

  if (error || !data) {
    return { invoices: [], nextCursor: null };
  }

  const hasNextPage = !batch_id && data.length > limit;
  const rows = hasNextPage ? data.slice(0, limit) : data;

  const invoices: InvoiceListItem[] = rows.map(
    (row: Record<string, unknown>) => {
      const hasExtractedData = row.vendor_name != null || row.invoice_number != null
        || row.invoice_date != null || row.total_amount != null;

      return {
        id: row.id as string,
        file_name: row.file_name as string,
        status: row.status as InvoiceListItem["status"],
        uploaded_at: row.uploaded_at as string,
        output_type: (row.output_type as InvoiceListItem["output_type"]) ?? null,
        batch_id: (row.batch_id as string) ?? null,
        source: (row.source as InvoiceListItem["source"]) ?? "upload",
        email_sender: (row.email_sender as string) ?? null,
        error_message: (row.error_message as string) ?? null,
        extracted_data: hasExtractedData
          ? {
              vendor_name: (row.vendor_name as string) ?? null,
              invoice_number: (row.invoice_number as string) ?? null,
              invoice_date: (row.invoice_date as string) ?? null,
              total_amount: (row.total_amount as number) ?? null,
            }
          : null,
      };
    }
  );

  let nextCursor: string | null = null;
  if (hasNextPage) {
    const lastInvoice = rows[rows.length - 1] as Record<string, unknown>;
    nextCursor = encodeCursor(
      lastInvoice[sortColumn] as string | number | null,
      lastInvoice.id as string
    );
  }

  return { invoices, nextCursor };
}

// --- Batch manifest ---

export interface BatchManifestItem {
  id: string;
  status: InvoiceStatus;
  uploaded_at: string;
}

export async function fetchBatchManifest(
  supabase: SupabaseClient,
  batchId: string
): Promise<BatchManifestItem[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, status, uploaded_at")
    .eq("batch_id", batchId)
    .order("uploaded_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    status: row.status as InvoiceStatus,
    uploaded_at: row.uploaded_at as string,
  }));
}
