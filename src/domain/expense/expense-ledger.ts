import { Money, Currency } from "../../shared/money.js";
import { Period } from "../../shared/period.js";
import { EmployeeId } from "../../shared/ids.js";
import { LedgerEntry } from "./ledger-entry.js";

/**
 * The expense-tracker domain's ledger for a single employee: the collection of
 * settled reimbursement entries. It keeps the transactions and is used as a
 * validation source — as an employee keeps adding claims, cumulative totals are
 * checked against policy caps.
 *
 * This is a domain object (no I/O). It is loaded/saved via ExpenseRepository.
 */
export class ExpenseLedger {
  private constructor(
    readonly employeeId: EmployeeId,
    private readonly entries: LedgerEntry[],
  ) {}

  static forEmployee(employeeId: EmployeeId, entries: LedgerEntry[] = []): ExpenseLedger {
    return new ExpenseLedger(employeeId, [...entries]);
  }

  /** Append a settled reimbursement. Returns a new ledger (immutability). */
  append(entry: LedgerEntry): ExpenseLedger {
    return new ExpenseLedger(this.employeeId, [...this.entries, entry]);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /**
   * Total reimbursed in a period, in the requested currency. Entries in other
   * currencies are ignored (this prototype settles all reimbursements in the
   * budget currency, so a mismatch would be a data error rather than a mix).
   */
  totalReimbursedIn(period: Period, currency: Currency): Money {
    return this.entries
      .filter((e) => e.period.equals(period) && e.amount.currency === currency)
      .reduce((sum, e) => sum.add(e.amount), Money.zero(currency));
  }
}
