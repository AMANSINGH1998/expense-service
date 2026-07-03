/**
 * Branded id types. Branding stops an EmployeeId being passed where an
 * ExpenseId is expected, at compile time, with zero runtime cost.
 */
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type ExpenseId = Brand<string, "ExpenseId">;
export type EmployeeId = Brand<string, "EmployeeId">;
export type EmployerId = Brand<string, "EmployerId">;
export type DepartmentId = Brand<string, "DepartmentId">;
export type PolicyId = Brand<string, "PolicyId">;
export type BudgetId = Brand<string, "BudgetId">;
export type ReimbursementId = Brand<string, "ReimbursementId">;
export type JournalEntryId = Brand<string, "JournalEntryId">;

export const asExpenseId = (v: string) => v as ExpenseId;
export const asEmployeeId = (v: string) => v as EmployeeId;
export const asEmployerId = (v: string) => v as EmployerId;
export const asDepartmentId = (v: string) => v as DepartmentId;
export const asPolicyId = (v: string) => v as PolicyId;
export const asBudgetId = (v: string) => v as BudgetId;
export const asReimbursementId = (v: string) => v as ReimbursementId;
export const asJournalEntryId = (v: string) => v as JournalEntryId;
