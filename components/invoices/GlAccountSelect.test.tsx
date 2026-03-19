import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GlAccountSelect from "./GlAccountSelect";
import type { AccountOption } from "@/lib/types/qbo";

const MOCK_ACCOUNTS: AccountOption[] = [
  { value: "acc-1", label: "Office Supplies", accountType: "Expense" },
  { value: "acc-2", label: "Software & Subscriptions", accountType: "Expense" },
  { value: "acc-3", label: "Professional Services", accountType: "Expense" },
];

const defaultProps = {
  accounts: MOCK_ACCOUNTS,
  loading: false,
  connected: true,
  currentAccountId: null,
  onSelect: vi.fn().mockResolvedValue(true),
};

describe("GlAccountSelect", () => {
  it("shows AI suggestion label when suggestedAccountId is provided and no account is selected", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    expect(screen.getByText(/suggests:/i)).toBeInTheDocument();
    // Account name appears in both the suggestion label and the dropdown option with AI prefix
    const matches = screen.getAllByText(/Software & Subscriptions/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // The AI badge inside the suggestion label
    const badges = screen.getAllByText("AI");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show suggestion label when no suggestedAccountId is provided", () => {
    render(<GlAccountSelect {...defaultProps} />);

    expect(screen.queryByText(/suggests:/i)).toBeNull();
  });

  it("does not show suggestion label when account is already confirmed (currentAccountId is set)", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-1"
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    expect(screen.queryByText(/suggests:/i)).toBeNull();
  });

  it("shows suggested account as first option with AI prefix in dropdown", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-3"
        suggestionSource="ai"
      />
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options);

    // First real option (index 0 is "Select account..." placeholder)
    expect(options[1].text).toBe("AI · Professional Services");
    expect(options[1].value).toBe("acc-3");
  });

  it("renders placeholder option as first option", () => {
    render(<GlAccountSelect {...defaultProps} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options[0].text).toBe("Select account...");
    expect(select.options[0].value).toBe("");
  });

  it("does not show suggestion label when suggestionSource is null", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-1"
        suggestionSource={null}
      />
    );

    expect(screen.queryByText(/suggests:/i)).toBeNull();
  });
});
