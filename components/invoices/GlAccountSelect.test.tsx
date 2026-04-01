import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows search input with placeholder when no account is selected", () => {
    render(<GlAccountSelect {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search accounts...")).toBeInTheDocument();
  });

  it("shows classification groups when dropdown is open with no search text", () => {
    render(<GlAccountSelect {...defaultProps} />);
    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));

    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("Liability")).toBeInTheDocument();
    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Office Supplies")).toBeInTheDocument();
    expect(screen.getByText("Officers Loans")).toBeInTheDocument();
  });

  it("filters accounts across all classifications when typing", async () => {
    render(<GlAccountSelect {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search accounts...");

    await userEvent.type(input, "Officer");

    expect(screen.getByText("Officers Loans")).toBeInTheDocument();
    expect(screen.queryByText("Office Supplies")).toBeNull();
    expect(screen.queryByText("Software & Subscriptions")).toBeNull();
    // Classification headers should not appear when searching
    expect(screen.queryByText("Expense")).toBeNull();
    expect(screen.queryByText("Liability")).toBeNull();
  });

  it("shows no-match message when search has no results", async () => {
    render(<GlAccountSelect {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search accounts...");

    await userEvent.type(input, "zzzzz");

    expect(screen.getByText(/No accounts match/)).toBeInTheDocument();
  });

  it("calls onSelect when clicking an account in the dropdown", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<GlAccountSelect {...defaultProps} onSelect={onSelect} />);

    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));
    fireEvent.click(screen.getByText("Office Supplies"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("acc-1");
    });
  });

  it("shows selected account with clear button when account is selected", () => {
    render(<GlAccountSelect {...defaultProps} currentAccountId="acc-1" />);

    expect(screen.getByText("Office Supplies")).toBeInTheDocument();
    expect(screen.getByLabelText("Clear account selection")).toBeInTheDocument();
  });

  it("calls onSelect(null) when clear button is clicked", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(<GlAccountSelect {...defaultProps} currentAccountId="acc-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText("Clear account selection"));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(null);
    });
  });

  it("closes dropdown on outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <GlAccountSelect {...defaultProps} />
      </div>
    );

    fireEvent.focus(screen.getByPlaceholderText("Search accounts..."));
    expect(screen.getByText("Office Supplies")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Office Supplies")).toBeNull();
  });

  it("shows clickable AI suggestion pill when suggestedAccountId is provided and no account selected", () => {
    render(
      <GlAccountSelect
        {...defaultProps}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    const pill = screen.getByTitle(/Accept suggestion/i);
    expect(pill).toBeInTheDocument();
    expect(screen.getByText("Software & Subscriptions")).toBeInTheDocument();
    const badges = screen.getAllByText("AI");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onSelect when AI suggestion pill is clicked", async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(
      <GlAccountSelect
        {...defaultProps}
        onSelect={onSelect}
        suggestedAccountId="acc-2"
        suggestionSource="ai"
      />
    );

    fireEvent.click(screen.getByTitle(/Accept suggestion/i));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("acc-2");
    });
  });

  it("does not show AI suggestion pill when account is already selected", () => {
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

  it("shows Learned badge when suggestionSource is history and account is pre-filled", () => {
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

  it("shows dash when not connected", () => {
    render(<GlAccountSelect {...defaultProps} connected={false} />);
    expect(screen.getByText("\u2014")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    render(<GlAccountSelect {...defaultProps} loading={true} />);
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });
});
