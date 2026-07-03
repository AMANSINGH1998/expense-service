import { EmployeeId, ExpenseId } from "../../shared/ids.js";
import { Expense } from "./expense.js";
import { ExpenseLedger } from "./expense-ledger.js";
import { LedgerEntry } from "./ledger-entry.js";

/**
 * Port for expense persistence. Implemented in infrastructure. The domain
 * depends only on this interface (Dependency Inversion).
 */
export interface ExpenseRepository {
  save(expense: Expense): Promise<void>;
  findById(id: ExpenseId): Promise<Expense | null>;

  /** Load the employee's reimbursement ledger. */
  loadLedger(employeeId: EmployeeId): Promise<ExpenseLedger>;

  /** Append one settled reimbursement to the employee's ledger. */
  appendLedgerEntry(entry: LedgerEntry): Promise<void>;
}
