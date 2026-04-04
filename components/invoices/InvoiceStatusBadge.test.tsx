import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import type { InvoiceStatus } from "@/lib/types/invoice";

const STATUSES: { status: InvoiceStatus; label: string }[] = [
  { status: "uploading", label: "Uploading" },
  { status: "extracting", label: "Extracting" },
  { status: "pending_review", label: "Review" },
  { status: "approved", label: "Approved" },
  { status: "synced", label: "Synced" },
  { status: "error", label: "Error" },
];

describe("InvoiceStatusBadge", () => {
  it.each(STATUSES)("renders correct label for status: $status", ({ status, label }) => {
    render(<InvoiceStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it("extracting status has a pulsing dot with animate-pulse class", () => {
    const { container } = render(<InvoiceStatusBadge status="extracting" />);
    const pulseEl = container.querySelector(".animate-pulse");
    expect(pulseEl).not.toBeNull();
  });

  it("non-animated statuses do not have an animated dot", () => {
    const staticStatuses: InvoiceStatus[] = [
      "pending_review",
      "approved",
      "synced",
      "error",
    ];
    for (const status of staticStatuses) {
      const { container } = render(<InvoiceStatusBadge status={status} />);
      const animatedEl = container.querySelector(".animate-pulse, .animate-ping");
      expect(animatedEl, `Expected no animated dot for status: ${status}`).toBeNull();
    }
  });

  it("synced status has green background", () => {
    const { container } = render(<InvoiceStatusBadge status="synced" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#ECFDF5]");
  });

  it("error status has red background", () => {
    const { container } = render(<InvoiceStatusBadge status="error" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#FEF2F2]");
  });

  it("pending_review status has orange background", () => {
    const { container } = render(<InvoiceStatusBadge status="pending_review" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#FFF7ED]");
  });

  it("extracting status has purple background", () => {
    const { container } = render(<InvoiceStatusBadge status="extracting" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#EDE9FE]");
  });

  it("approved status has blue background", () => {
    const { container } = render(<InvoiceStatusBadge status="approved" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#EFF6FF]");
  });

  it("uploading status has orange background", () => {
    const { container } = render(<InvoiceStatusBadge status="uploading" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("bg-[#FFF7ED]");
  });

  it("badge uses rounded-lg and font-semibold", () => {
    const { container } = render(<InvoiceStatusBadge status="approved" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain("rounded-lg");
    expect(pill.className).toContain("font-semibold");
    expect(pill.className).toContain("px-3");
  });
});
