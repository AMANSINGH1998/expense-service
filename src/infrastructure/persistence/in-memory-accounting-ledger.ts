import { Money } from "../../shared/money.js";
import { JournalEntry } from "../../domain/accounting/journal-entry.js";
import { AccountingLedger } from "../../domain/accounting/accounting-ledger.js";

/**
 * In-memory general ledger. Since JournalEntry enforces its balance invariant at
 * construction, every posted entry is already balanced; this store just keeps
 * them and can report aggregate balance for inspection/tests.
 */
export class InMemoryAccountingLedger implements AccountingLedger {
  private readonly entries: JournalEntry[] = [];

  async post(entry: JournalEntry): Promise<void> {
    this.entries.push(entry);
  }

  all(): readonly JournalEntry[] {
    return this.entries;
  }

  /** True iff every entry balances and, per currency, debits == credits. */
  isGloballyBalanced(): boolean {
    const debit = new Map<string, number>();
    const credit = new Map<string, number>();
    for (const e of this.entries) {
      if (!e.isBalanced()) return false;
      const c = e.currency;
      debit.set(c, (debit.get(c) ?? 0) + e.totalDebits().minorUnits);
      credit.set(c, (credit.get(c) ?? 0) + e.totalCredits().minorUnits);
    }
    for (const c of debit.keys()) {
      if (debit.get(c) !== credit.get(c)) return false;
    }
    return true;
  }

  totalPosted(currency: string): Money {
    return this.entries
      .filter((e) => e.currency === currency)
      .reduce((sum, e) => sum.add(e.totalDebits()), Money.zero(currency));
  }
}
