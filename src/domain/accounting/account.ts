/**
 * Chart-of-accounts primitives for the double-entry accounting module.
 */

/** The five classical account categories. */
export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EXPENSE = "EXPENSE",
  REVENUE = "REVENUE",
  EQUITY = "EQUITY",
}

/** A single account in the chart of accounts. */
export interface Account {
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
}

/** Well-known accounts used by the expense/reimbursement flows. */
export const ACCOUNTS = {
  DEPARTMENT_EXPENSE: {
    code: "5000",
    name: "Department Expense",
    type: AccountType.EXPENSE,
  },
  EMPLOYEE_PAYABLE: {
    code: "2000",
    name: "Employee Reimbursement Payable",
    type: AccountType.LIABILITY,
  },
  CASH: {
    code: "1000",
    name: "Cash",
    type: AccountType.ASSET,
  },
} as const satisfies Record<string, Account>;
