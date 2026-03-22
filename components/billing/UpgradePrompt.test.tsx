import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UpgradePrompt from "./UpgradePrompt";

describe("UpgradePrompt", () => {
  it("renders feature name and upgrade CTA", () => {
    render(
      <UpgradePrompt
        featureName="Batch upload"
        requiredTier="pro"
      />
    );
    expect(screen.getByText(/Batch upload/)).toBeTruthy();
    expect(screen.getByText(/Pro/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /upgrade/i })).toBeTruthy();
  });

  it("links to /pricing", () => {
    render(
      <UpgradePrompt
        featureName="Bill-to-check"
        requiredTier="pro"
      />
    );
    const link = screen.getByRole("link", { name: /upgrade/i });
    expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("renders inline variant without border by default", () => {
    const { container } = render(
      <UpgradePrompt featureName="Test" requiredTier="pro" />
    );
    expect(container.querySelector("[data-testid='upgrade-prompt']")).toBeTruthy();
  });

  it("renders banner variant with more prominent styling", () => {
    const { container } = render(
      <UpgradePrompt featureName="Test" requiredTier="pro" variant="banner" />
    );
    expect(container.querySelector("[data-testid='upgrade-prompt']")).toBeTruthy();
  });
});
