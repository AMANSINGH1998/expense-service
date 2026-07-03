import { asExpenseId, asPolicyId } from "../../shared/ids.js";
import { DomainError, Result, err, ok } from "../../shared/result.js";
import { ExpenseStatus } from "../../domain/expense/expense-status.js";
import { ExpenseRepository } from "../../domain/expense/expense-repository.js";
import { BudgetRepository } from "../../domain/budget/budget-repository.js";
import { FxRateProvider } from "../ports/fx-rate-provider.js";
import { LockManager } from "../ports/lock-manager.js";
import { ReimbursementManager } from "../services/reimbursement-manager.js";

export interface ReviewExpenseCommand {
  expenseId: string;
  /** The employer/reviewer acting on the pending expense. */
  reviewerId: string;
  approve: boolean;
  note: string;
}

export interface ReviewExpenseResult {
  expenseId: string;
  status: ExpenseStatus;
  reimbursementId: string | null;
}

/**
 * Manual review of a PENDING expense by the employer. Approving deducts budget
 * and records reimbursement — the same money-movement path as auto-approve, so
 * it runs under the same per-policy lock to stay consistent with concurrent
 * auto-approvals.
 */
export class ReviewExpenseUseCase {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly budgets: BudgetRepository,
    private readonly fx: FxRateProvider,
    private readonly locks: LockManager,
    private readonly reimbursementManager: ReimbursementManager,
  ) {}

  async execute(cmd: ReviewExpenseCommand): Promise<Result<ReviewExpenseResult>> {
    const expense = await this.expenses.findById(asExpenseId(cmd.expenseId));
    if (!expense) {
      return err(new DomainError("EXPENSE_NOT_FOUND", `Expense ${cmd.expenseId} not found`));
    }
    if (expense.status !== ExpenseStatus.PENDING) {
      return err(
        new DomainError(
          "EXPENSE_NOT_PENDING",
          `Expense ${cmd.expenseId} is ${expense.status}, not PENDING`,
        ),
      );
    }

    return this.locks.withLock(`policy:${asPolicyId(expense.policyId)}`, async () => {
      if (!cmd.approve) {
        const r = expense.reject(cmd.note || "Rejected by reviewer", null);
        if (!r.ok) return err(r.error);
        await this.expenses.save(expense);
        return ok({ expenseId: expense.id, status: expense.status, reimbursementId: null });
      }

      const budget = await this.budgets.findForDepartment(
        expense.departmentId,
        expense.period,
      );
      if (!budget) {
        return err(new DomainError("BUDGET_NOT_FOUND", "No budget to approve against"));
      }
      const amount = this.fx.convert(expense.amount, budget.currency);
      const deducted = budget.deduct(amount);
      if (!deducted.ok) {
        return err(deducted.error);
      }
      await this.budgets.save(budget);

      const approved = expense.approve(cmd.note || "Approved by reviewer", null);
      if (!approved.ok) return err(approved.error);
      await this.expenses.save(expense);

      const txn = await this.reimbursementManager.recordApprovedReimbursement(expense, amount);
      return ok({ expenseId: expense.id, status: expense.status, reimbursementId: txn.id });
    });
  }
}
