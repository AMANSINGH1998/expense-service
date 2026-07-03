import { EmployeeId, ExpenseId } from "../../shared/ids.js";
import { Expense, ExpenseProps } from "../../domain/expense/expense.js";
import { ExpenseLedger } from "../../domain/expense/expense-ledger.js";
import { ExpenseRepository } from "../../domain/expense/expense-repository.js";
import { LedgerEntry } from "../../domain/expense/ledger-entry.js";

/**
 * In-memory ExpenseRepository. Stores snapshots and rehydrates on read, so the
 * repo behaves like a real DB (callers can't accidentally mutate stored state
 * through a shared reference) — which is exactly what the concurrency test
 * relies on.
 */
export class InMemoryExpenseRepository implements ExpenseRepository {
  private readonly store = new Map<ExpenseId, ExpenseProps>();
  private readonly ledgers = new Map<EmployeeId, LedgerEntry[]>();

  async save(expense: Expense): Promise<void> {
    this.store.set(expense.id, { ...expense.snapshot() });
  }

  async findById(id: ExpenseId): Promise<Expense | null> {
    const props = this.store.get(id);
    return props ? Expense.rehydrate({ ...props }) : null;
  }

  async loadLedger(employeeId: EmployeeId): Promise<ExpenseLedger> {
    return ExpenseLedger.forEmployee(employeeId, [...(this.ledgers.get(employeeId) ?? [])]);
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<void> {
    const list = this.ledgers.get(entry.employeeId) ?? [];
    list.push(entry);
    this.ledgers.set(entry.employeeId, list);
  }

  /** Test/inspection helper. */
  all(): Expense[] {
    return [...this.store.values()].map((p) => Expense.rehydrate({ ...p }));
  }
}
