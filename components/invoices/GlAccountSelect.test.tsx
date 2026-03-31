import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GlAccountSelect from "./GlAccountSelect";
import type { AccountOption } from "@/lib/accounting";

const MOCK_ACCOUNTS: AccountOption[] = [
  { value: "acc-1", label: "Office Supplies", accountType: "Expense", classification: "Expense" },
  { value: "acc-2", label: "Software & Subscriptions", accountType: "Expense", classification: "Expense" },
  { value: "acc-3", label: "Professional Services", accountType: "Expense", classification: "Expense" },
  { value: "acc-4", label: "Officers Loans", accountType: "Other Current Liability", classification: "Liability" },
  { value: "acc-5", label: "Prepaid Expenses", accountType: "Other Current Asset", classification: "Asset" },
];

const defaultProps = {
  accounts: MOCK_ACCOUNTS,
  loading: false,
  connected: true,
  currentAccountId: null,
  onSelect: vi.fn().mockResolvedValue(true),
};

describe("GlAccountSelect", () => {
  it("shows clickable suggestion pill when suggestedAccountId is provided and no account is selected", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    // Suggestion pill is a button with the account name
    const pill = screen.getByTitle(/Accept suggestion/i);
    expect(pill).toBeInTheDocument();
    expect(screen.getByText("Software & Subscriptions")).toBeInTheDocument();
    // AI badge inside the pill
    const badges = screen.getAllByText("AI");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSelect when suggestion pill is clicked", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(
      <GlAccountSelect
        {...defaultProps}
        onSelect={onSelect}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    const pill = screen.getByTitle(/Accept suggestion/i);
    await pill.click();

    expect(onSelect).toHaveBeenCalledWith("acc-2");
  });

  it("does not show suggestion pill when no suggestedAccountId is provided", () => {
    render(<GlAccountSelect {...defaultProps} />);

    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
  });

  it("does not show suggestion pill when account is already confirmed (currentAccountId is set)", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-1"
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
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

  it("does not show suggestion pill when suggestionSource is null", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-1"
        suggestionSource={null}
      />
    );

    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
  });

  it("shows 'Learned' badge when suggestionSource is 'history' and account is pre-filled", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-2"
        suggestedAccountId="acc-2"
        suggestionSource="history"
      />
    );

    expect(screen.getByText("Learned")).toBeInTheDocument();
    expect(screen.queryByTitle(/Accept suggestion/i)).toBeNull();
  });

  it("renders accounts grouped by classification with optgroup labels", () => {
    render(<GlAccountSelect {...defaultProps} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optgroups = select.querySelectorAll("optgroup");

    expect(optgroups.length).toBeGreaterThanOrEqual(2);

    const groupLabels = Array.from(optgroups).map((g) => g.label);
    expect(groupLabels).toContain("Expense");
    expect(groupLabels).toContain("Liability");

    // Expense group should appear before Liability
    expect(groupLabels.indexOf("Expense")).toBeLessThan(groupLabels.indexOf("Liability"));
  });

  it("does not show 'Learned' badge after user changes selection (cleared source)", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-1"
        suggestedAccountId="acc-2"
        suggestionSource={null}
      />
    );

    expect(screen.queryByText("Learned")).toBeNull();
  });

  it("shows 'Learned' prefix in dropdown for history-sourced suggestion", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        currentAccountId="acc-2"
        suggestedAccountId="acc-2"
        suggestionSource="history"
      />
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options[1].text).toBe("Learned · Software & Subscriptions");
  });
});
