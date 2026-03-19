import { describe, it, expect } from "vitest";
import {
  OUTPUT_TYPE_TO_PAYMENT_TYPE,
  OUTPUT_TYPE_TO_ACCOUNT_TYPE,
  OUTPUT_TYPE_LABELS,
  OUTPUT_TYPE_HELPER_TEXT,
  SYNC_SUCCESS_MESSAGES,
  TRANSACTION_TYPE_SHORT_LABELS,
} from "./invoice";

describe("OutputType domain types", () => {
  describe("OUTPUT_TYPE_TO_PAYMENT_TYPE", () => {
    it("maps check to Check", () => {
      expect(OUTPUT_TYPE_TO_PAYMENT_TYPE.check).toBe("Check");
    });
    it("maps cash to Cash", () => {
      expect(OUTPUT_TYPE_TO_PAYMENT_TYPE.cash).toBe("Cash");
    });
    it("maps credit_card to CreditCard", () => {
      expect(OUTPUT_TYPE_TO_PAYMENT_TYPE.credit_card).toBe("CreditCard");
    });
    it("does not include bill", () => {
      expect("bill" in OUTPUT_TYPE_TO_PAYMENT_TYPE).toBe(false);
    });
  });

  describe("OUTPUT_TYPE_TO_ACCOUNT_TYPE", () => {
    it("maps check to Bank", () => {
      expect(OUTPUT_TYPE_TO_ACCOUNT_TYPE.check).toBe("Bank");
    });
    it("maps cash to Bank", () => {
      expect(OUTPUT_TYPE_TO_ACCOUNT_TYPE.cash).toBe("Bank");
    });
    it("maps credit_card to CreditCard", () => {
      expect(OUTPUT_TYPE_TO_ACCOUNT_TYPE.credit_card).toBe("CreditCard");
    });
  });

  describe("OUTPUT_TYPE_LABELS", () => {
    it("has labels for all 4 output types", () => {
      expect(Object.keys(OUTPUT_TYPE_LABELS)).toHaveLength(4);
      expect(OUTPUT_TYPE_LABELS.bill).toBe("Create Bill");
      expect(OUTPUT_TYPE_LABELS.check).toBe("Write Check");
      expect(OUTPUT_TYPE_LABELS.cash).toBe("Record Expense");
      expect(OUTPUT_TYPE_LABELS.credit_card).toBe("Credit Card");
    });
  });

  describe("OUTPUT_TYPE_HELPER_TEXT", () => {
    it("has helper text for non-bill types only", () => {
      expect(Object.keys(OUTPUT_TYPE_HELPER_TEXT)).toHaveLength(3);
      expect("bill" in OUTPUT_TYPE_HELPER_TEXT).toBe(false);
    });
  });

  describe("SYNC_SUCCESS_MESSAGES", () => {
    it("has messages for all 4 output types", () => {
      expect(Object.keys(SYNC_SUCCESS_MESSAGES)).toHaveLength(4);
      expect(SYNC_SUCCESS_MESSAGES.bill).toContain("Bill");
      expect(SYNC_SUCCESS_MESSAGES.check).toContain("Check");
      expect(SYNC_SUCCESS_MESSAGES.cash).toContain("Expense");
      expect(SYNC_SUCCESS_MESSAGES.credit_card).toContain("Credit card");
    });
  });

  describe("TRANSACTION_TYPE_SHORT_LABELS", () => {
    it("has short labels for all 4 types", () => {
      expect(TRANSACTION_TYPE_SHORT_LABELS.bill).toBe("Bill");
      expect(TRANSACTION_TYPE_SHORT_LABELS.check).toBe("Check");
      expect(TRANSACTION_TYPE_SHORT_LABELS.cash).toBe("Expense");
      expect(TRANSACTION_TYPE_SHORT_LABELS.credit_card).toBe("CC");
    });
  });
});
