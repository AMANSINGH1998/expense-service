/**
 * Lifecycle of an expense. Persisted as SUBMITTED first; state is only updated
 * after policy validation (under a lock on the policy).
 */
export enum ExpenseStatus {
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  PENDING = "PENDING",
  NON_APPROVED = "NON_APPROVED",
  REJECTED = "REJECTED",
}

/** States from which no further transition is allowed. */
const TERMINAL: ReadonlySet<ExpenseStatus> = new Set([
  ExpenseStatus.APPROVED,
  ExpenseStatus.NON_APPROVED,
  ExpenseStatus.REJECTED,
]);

const ALLOWED: ReadonlyMap<ExpenseStatus, ReadonlySet<ExpenseStatus>> = new Map([
  [
    ExpenseStatus.SUBMITTED,
    new Set([
      ExpenseStatus.APPROVED,
      ExpenseStatus.PENDING,
      ExpenseStatus.NON_APPROVED,
      ExpenseStatus.REJECTED,
    ]),
  ],
  // Manual review of a pending expense.
  [ExpenseStatus.PENDING, new Set([ExpenseStatus.APPROVED, ExpenseStatus.REJECTED])],
]);

export const isTerminal = (s: ExpenseStatus): boolean => TERMINAL.has(s);

export const canTransition = (from: ExpenseStatus, to: ExpenseStatus): boolean =>
  ALLOWED.get(from)?.has(to) ?? false;
