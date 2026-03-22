// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadGate from "./UploadGate";

describe("UploadGate", () => {
  it("shows trial exhausted copy when trialExhausted is true", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExhausted={true} />);
    expect(screen.getByText("Trial complete")).toBeInTheDocument();
    expect(screen.getByText("You've used all 10 trial invoices. Choose a plan to continue processing.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows cancelled copy when subscriptionStatus is cancelled", () => {
    render(<UploadGate subscriptionStatus="cancelled" trialExhausted={false} />);
    expect(screen.getByText("Your subscription is inactive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows past_due copy when subscriptionStatus is past_due", () => {
    render(<UploadGate subscriptionStatus="past_due" trialExhausted={false} />);
    expect(screen.getByText("Payment issue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update Payment" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows default never-subscribed copy", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExhausted={false} />);
    expect(screen.getByText("Subscribe to process invoices")).toBeInTheDocument();
    expect(screen.getByText("Start your subscription to upload, extract, and sync invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows usage limit copy", () => {
    render(<UploadGate subscriptionStatus="usage_limit" trialExhausted={false} />);
    expect(screen.getByText("Monthly limit reached")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });
});
