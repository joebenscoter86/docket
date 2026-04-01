import { describe, it, expect } from "vitest";
import { inferTaxExpenseAccount } from "./tax-account-inference";
import type { AccountOption } from "./types";

const makeAccount = (value: string, label: string, classification = "Expense"): AccountOption => ({
  value,
  label,
  accountType: "Expense",
  classification,
});

describe("inferTaxExpenseAccount", () => {
  it("returns Xero default 'Taxes - Other' when present", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("6380", "Taxes - Other"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("6380");
  });

  it("returns QBO default 'Taxes & Licenses' when present", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("42", "Taxes & Licenses"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("42");
  });

  it("prefers 'Taxes - Other' over 'Taxes & Licenses' when both present", () => {
    const accounts: AccountOption[] = [
      makeAccount("6380", "Taxes - Other"),
      makeAccount("42", "Taxes & Licenses"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("6380");
  });

  it("falls back to any expense account containing 'tax' in the name", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("500", "Business Tax Expense"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("500");
  });

  it("excludes liability accounts like 'Sales Tax'", () => {
    const accounts: AccountOption[] = [
      makeAccount("2230", "Sales Tax", "Liability"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("excludes payroll tax accounts", () => {
    const accounts: AccountOption[] = [
      makeAccount("6360", "Taxes - Payroll"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("excludes property tax accounts", () => {
    const accounts: AccountOption[] = [
      makeAccount("6370", "Taxes - Property"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("returns null when no tax expense account is found", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("returns null for empty accounts list", () => {
    expect(inferTaxExpenseAccount([])).toBeNull();
  });

  it("matching is case-insensitive", () => {
    const accounts: AccountOption[] = [
      makeAccount("99", "taxes - other"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("99");
  });
});
