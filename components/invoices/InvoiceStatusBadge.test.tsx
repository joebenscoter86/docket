import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import type { InvoiceStatus } from "@/lib/types/invoice";

const STATUSES: { status: InvoiceStatus; label: string }[] = [
  { status: "uploading", label: "Uploading" },
  { status: "extracting", label: "Extracting" },
  { status: "pending_review", label: "Pending Review" },
  { status: "approved", label: "Approved" },
  { status: "synced", label: "Synced" },
  { status: "error", label: "Error" },
];

describe("InvoiceStatusBadge", () => {
  it.each(STATUSES)("renders correct label for status: $status", ({ status, label }) => {
    render(<InvoiceStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it("extracting status has a pulsing dot with animate-ping class", () => {
    const { container } = render(<InvoiceStatusBadge status="extracting" />);
    const pingEl = container.querySelector(".animate-ping");
    expect(pingEl).not.toBeNull();
  });

  it("non-extracting statuses do not have animate-ping class", () => {
    const nonPulsingStatuses: InvoiceStatus[] = [
      "uploading",
      "pending_review",
      "approved",
      "synced",
      "error",
    ];
    for (const status of nonPulsingStatuses) {
      const { container } = render(<InvoiceStatusBadge status={status} />);
      const pingEl = container.querySelector(".animate-ping");
      expect(pingEl, `Expected no animate-ping for status: ${status}`).toBeNull();
    }
  });

  it("synced status has green background class", () => {
    const { container } = render(<InvoiceStatusBadge status="synced" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-green/);
  });

  it("error status has red background class", () => {
    const { container } = render(<InvoiceStatusBadge status="error" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-red/);
  });

  it("pending_review status has amber background class", () => {
    const { container } = render(<InvoiceStatusBadge status="pending_review" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-amber/);
  });

  it("uploading status has blue background class", () => {
    const { container } = render(<InvoiceStatusBadge status="uploading" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-blue/);
  });

  it("extracting status has blue background class", () => {
    const { container } = render(<InvoiceStatusBadge status="extracting" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-blue/);
  });

  it("approved status has blue background class", () => {
    const { container } = render(<InvoiceStatusBadge status="approved" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toMatch(/bg-blue/);
  });
});
