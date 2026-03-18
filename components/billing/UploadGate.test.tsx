// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadGate from "./UploadGate";

describe("UploadGate", () => {
  it("shows trial expired copy when trialExpired is true", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExpired={true} />);
    expect(screen.getByText("Your free trial has ended")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to continue processing invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows cancelled copy when subscriptionStatus is cancelled", () => {
    render(<UploadGate subscriptionStatus="cancelled" trialExpired={false} />);
    expect(screen.getByText("Your subscription is inactive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Subscription" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows past_due copy when subscriptionStatus is past_due", () => {
    render(<UploadGate subscriptionStatus="past_due" trialExpired={false} />);
    expect(screen.getByText("Payment issue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update Payment" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows default never-subscribed copy", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExpired={false} />);
    expect(screen.getByText("Subscribe to process invoices")).toBeInTheDocument();
    expect(screen.getByText("Start your subscription to upload, extract, and sync invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });
});
