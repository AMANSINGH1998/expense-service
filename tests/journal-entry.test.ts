import { describe, it, expect } from "vitest";
import { JournalEntry } from "../src/domain/accounting/journal-entry.js";
import { ACCOUNTS } from "../src/domain/accounting/account.js";
import { Money } from "../src/shared/money.js";
import { DomainError } from "../src/shared/result.js";
import { asJournalEntryId } from "../src/shared/ids.js";

describe("JournalEntry", () => {
  describe("simpleTransfer", () => {
    const entry = JournalEntry.simpleTransfer({
      id: asJournalEntryId("je-1"),
      narration: "reimbursement",
      postedAt: new Date(),
      debitAccount: ACCOUNTS.DEPARTMENT_EXPENSE,
      creditAccount: ACCOUNTS.EMPLOYEE_PAYABLE,
      amount: Money.of(100, "USD"),
    });

    it("is balanced", () => {
      expect(entry.isBalanced()).toBe(true);
    });

    it("has equal total debits and credits of 10000 minor units", () => {
      expect(entry.totalDebits().minorUnits).toBe(10000);
      expect(entry.totalCredits().minorUnits).toBe(10000);
      expect(entry.totalDebits().minorUnits).toBe(entry.totalCredits().minorUnits);
    });

    it("has exactly two lines", () => {
      expect(entry.lines.length).toBe(2);
    });
  });

  describe("create validation", () => {
    it("throws JOURNAL_UNBALANCED when debits do not equal credits", () => {
      let caught: unknown;
      try {
        JournalEntry.create({
          id: asJournalEntryId("je-2"),
          narration: "bad",
          postedAt: new Date(),
          currency: "USD",
          lines: [
            {
              account: ACCOUNTS.DEPARTMENT_EXPENSE,
              debit: Money.of(100, "USD"),
              credit: Money.zero("USD"),
            },
            {
              account: ACCOUNTS.EMPLOYEE_PAYABLE,
              debit: Money.zero("USD"),
              credit: Money.of(50, "USD"),
            },
          ],
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe("JOURNAL_UNBALANCED");
    });

    it("throws JOURNAL_EMPTY with fewer than two lines", () => {
      let caught: unknown;
      try {
        JournalEntry.create({
          id: asJournalEntryId("je-3"),
          narration: "single",
          postedAt: new Date(),
          currency: "USD",
          lines: [
            {
              account: ACCOUNTS.DEPARTMENT_EXPENSE,
              debit: Money.of(100, "USD"),
              credit: Money.zero("USD"),
            },
          ],
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe("JOURNAL_EMPTY");
    });
  });
});
