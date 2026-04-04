import { describe, it, expect } from "vitest";
import {
  groupInvoicesByBatch,
  getBatchStatusSummary,
  getNextReviewableInvoice,
} from "./batch-utils";
import type { InvoiceListItem } from "./types";

function makeInvoice(overrides: Partial<InvoiceListItem> & { id: string }): InvoiceListItem {
  return {
    file_name: "test.pdf",
    status: "pending_review",
    uploaded_at: "2026-03-18T10:00:00Z",
    output_type: null,
    batch_id: null,
    source: "upload",
    email_sender: null,
    error_message: null,
    sms_body_context: null,
    extracted_data: null,
    ...overrides,
  };
}

describe("groupInvoicesByBatch", () => {
  it("groups invoices with matching batch_id", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:01:00Z" }),
      makeInvoice({ id: "3", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result).toHaveLength(2); // 1 batch group + 1 individual
    const batchGroup = result.find((g) => g.type === "batch");
    expect(batchGroup?.invoices).toHaveLength(2);
  });

  it("treats single-invoice batches as individual rows", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: "batch-a" }),
      makeInvoice({ id: "2", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result.every((g) => g.type === "individual")).toBe(true);
  });

  it("returns individual rows for null batch_id invoices", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: null }),
      makeInvoice({ id: "2", batch_id: null }),
    ];
    const result = groupInvoicesByBatch(invoices);
    expect(result).toHaveLength(2);
    expect(result.every((g) => g.type === "individual")).toBe(true);
  });

  it("preserves server sort order based on first appearance", () => {
    const invoices = [
      makeInvoice({ id: "1", batch_id: null, uploaded_at: "2026-03-18T12:00:00Z" }),
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
      makeInvoice({ id: "3", batch_id: "batch-a", uploaded_at: "2026-03-18T10:01:00Z" }),
    ];
    const result = groupInvoicesByBatch(invoices);
    // Individual appears first in server results, so stays first
    expect(result[0].type).toBe("individual");
    expect(result[1].type).toBe("batch");
  });

  it("preserves server order when batch appears before individual", () => {
    const invoices = [
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
      makeInvoice({ id: "3", batch_id: "batch-a", uploaded_at: "2026-03-18T10:01:00Z" }),
      makeInvoice({ id: "1", batch_id: null, uploaded_at: "2026-03-18T12:00:00Z" }),
    ];
    const result = groupInvoicesByBatch(invoices);
    // Batch appears first in server results, so stays first
    expect(result[0].type).toBe("batch");
    expect(result[1].type).toBe("individual");
  });

  it("sorts invoices within a batch by uploaded_at ascending", () => {
    const invoices = [
      makeInvoice({ id: "2", batch_id: "batch-a", uploaded_at: "2026-03-18T10:05:00Z" }),
      makeInvoice({ id: "1", batch_id: "batch-a", uploaded_at: "2026-03-18T10:00:00Z" }),
    ];
    const result = groupInvoicesByBatch(invoices);
    const batch = result[0];
    expect(batch.invoices[0].id).toBe("1");
    expect(batch.invoices[1].id).toBe("2");
  });
});

describe("getBatchStatusSummary", () => {
  it("counts statuses correctly including uploading and approved", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "extracting" }),
      makeInvoice({ id: "2", status: "uploaded" }),
      makeInvoice({ id: "3", status: "uploading" }),
      makeInvoice({ id: "4", status: "pending_review" }),
      makeInvoice({ id: "5", status: "error" }),
      makeInvoice({ id: "6", status: "synced" }),
      makeInvoice({ id: "7", status: "approved" }),
    ];
    const summary = getBatchStatusSummary(invoices);
    expect(summary.processing).toBe(3); // extracting + uploaded + uploading
    expect(summary.readyForReview).toBe(1);
    expect(summary.synced).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.approved).toBe(1);
  });

  it("returns all zeros for empty array", () => {
    const summary = getBatchStatusSummary([]);
    expect(summary.processing).toBe(0);
    expect(summary.readyForReview).toBe(0);
  });
});

describe("getNextReviewableInvoice", () => {
  it("returns first pending_review invoice", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "synced" }),
      makeInvoice({ id: "2", status: "pending_review" }),
      makeInvoice({ id: "3", status: "pending_review" }),
    ];
    expect(getNextReviewableInvoice(invoices)).toBe("2");
  });

  it("returns null when no reviewable invoices", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "synced" }),
      makeInvoice({ id: "2", status: "approved" }),
    ];
    expect(getNextReviewableInvoice(invoices)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(getNextReviewableInvoice([])).toBeNull();
  });
});
