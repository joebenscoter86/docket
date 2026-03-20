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
  const batchMap = new Map<string, InvoiceListItem[]>();
  const individuals: InvoiceListItem[] = [];

  for (const invoice of invoices) {
    if (invoice.batch_id) {
      const existing = batchMap.get(invoice.batch_id) ?? [];
      existing.push(invoice);
      batchMap.set(invoice.batch_id, existing);
    } else {
      individuals.push(invoice);
    }
  }

  const rows: InvoiceRow[] = [];

  for (const [batchId, batchInvoices] of Array.from(batchMap)) {
    if (batchInvoices.length === 1) {
      individuals.push(batchInvoices[0]);
      continue;
    }

    batchInvoices.sort(
      (a: InvoiceListItem, b: InvoiceListItem) =>
        new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    );

    rows.push({
      type: "batch",
      batchId,
      invoices: batchInvoices,
      earliestUploadedAt: batchInvoices[0].uploaded_at,
    });
  }

  for (const invoice of individuals) {
    rows.push({
      type: "individual",
      batchId: null,
      invoices: [invoice],
      earliestUploadedAt: invoice.uploaded_at,
    });
  }

  rows.sort(
    (a, b) =>
      new Date(b.earliestUploadedAt).getTime() - new Date(a.earliestUploadedAt).getTime()
  );

  return rows;
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
