import type { InvoiceListItem } from "./types";
import type { InvoiceStatus } from "@/lib/types/invoice";

export interface BatchGroup {
  type: "batch";
  batchId: string;
  invoices: InvoiceListItem[];
  earliestUploadedAt: string;
}

export interface IndividualRow {
  type: "individual";
  invoices: [InvoiceListItem];
  batchId: null;
  earliestUploadedAt: string;
}

export type InvoiceRow = BatchGroup | IndividualRow;

export interface BatchStatusSummary {
  processing: number;
  readyForReview: number;
  approved: number;
  synced: number;
  failed: number;
}

export function groupInvoicesByBatch(invoices: InvoiceListItem[]): InvoiceRow[] {
  // Track the position of the first invoice in each batch/individual
  // so we can preserve the server's sort order.
  const batchMap = new Map<string, { invoices: InvoiceListItem[]; firstIndex: number }>();
  const rows: { row: InvoiceRow; firstIndex: number }[] = [];

  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];
    if (invoice.batch_id) {
      const existing = batchMap.get(invoice.batch_id);
      if (existing) {
        existing.invoices.push(invoice);
      } else {
        batchMap.set(invoice.batch_id, { invoices: [invoice], firstIndex: i });
      }
    } else {
      rows.push({
        row: {
          type: "individual",
          batchId: null,
          invoices: [invoice],
          earliestUploadedAt: invoice.uploaded_at,
        },
        firstIndex: i,
      });
    }
  }

  for (const [batchId, { invoices: batchInvoices, firstIndex }] of Array.from(batchMap)) {
    if (batchInvoices.length === 1) {
      rows.push({
        row: {
          type: "individual",
          batchId: null,
          invoices: [batchInvoices[0]],
          earliestUploadedAt: batchInvoices[0].uploaded_at,
        },
        firstIndex,
      });
      continue;
    }

    // Sort within batch by uploaded_at for consistent internal ordering
    batchInvoices.sort(
      (a: InvoiceListItem, b: InvoiceListItem) =>
        new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    );

    rows.push({
      row: {
        type: "batch",
        batchId,
        invoices: batchInvoices,
        earliestUploadedAt: batchInvoices[0].uploaded_at,
      },
      firstIndex,
    });
  }

  // Preserve server sort order by using the position of each group's
  // first invoice in the original server-sorted array.
  rows.sort((a, b) => a.firstIndex - b.firstIndex);

  return rows.map((r) => r.row);
}

export function getBatchStatusSummary(invoices: InvoiceListItem[]): BatchStatusSummary {
  const summary: BatchStatusSummary = {
    processing: 0,
    readyForReview: 0,
    approved: 0,
    synced: 0,
    failed: 0,
  };

  for (const invoice of invoices) {
    switch (invoice.status) {
      case "uploading":
      case "uploaded":
      case "extracting":
        summary.processing++;
        break;
      case "pending_review":
        summary.readyForReview++;
        break;
      case "approved":
        summary.approved++;
        break;
      case "synced":
        summary.synced++;
        break;
      case "error":
        summary.failed++;
        break;
    }
  }

  return summary;
}

const REVIEWABLE_STATUSES: InvoiceStatus[] = ["pending_review"];

export function getNextReviewableInvoice(invoices: InvoiceListItem[]): string | null {
  const next = invoices.find((inv) => REVIEWABLE_STATUSES.includes(inv.status));
  return next?.id ?? null;
}
