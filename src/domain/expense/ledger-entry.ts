import { Money } from "../../shared/money.js";
import { Period } from "../../shared/period.js";
import { EmployeeId, ExpenseId, ReimbursementId } from "../../shared/ids.js";

/**
 * A single settled reimbursement recorded in the expense-tracker domain's own
 * ledger. This is the domain's record of "what has actually been reimbursed",
 * and it doubles as a validation source for cumulative caps.
 */
export interface LedgerEntry {
  readonly reimbursementId: ReimbursementId;
  readonly expenseId: ExpenseId;
  readonly employeeId: EmployeeId;
  /** Reimbursed amount, in budget currency. */
  readonly amount: Money;
  readonly period: Period;
  readonly recordedAt: Date;
}
