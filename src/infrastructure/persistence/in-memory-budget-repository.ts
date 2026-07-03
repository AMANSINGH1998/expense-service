import { BudgetId, DepartmentId } from "../../shared/ids.js";
import { Period } from "../../shared/period.js";
import {
  DepartmentalBudget,
  DepartmentalBudgetProps,
} from "../../domain/budget/departmental-budget.js";
import { BudgetRepository } from "../../domain/budget/budget-repository.js";

/**
 * In-memory BudgetRepository. Stores snapshots and rehydrates on read so every
 * read is an isolated copy — the SubmitExpense use case does its read-deduct-save
 * inside the per-policy lock, and this repo makes that a genuine
 * read-modify-write against persisted state.
 */
export class InMemoryBudgetRepository implements BudgetRepository {
  private readonly store = new Map<BudgetId, DepartmentalBudgetProps>();

  private static deptKey(departmentId: DepartmentId, period: Period): string {
    return `${departmentId}::${period.key}`;
  }
  private readonly byDept = new Map<string, BudgetId>();

  async save(budget: DepartmentalBudget): Promise<void> {
    const snap = budget.snapshot();
    this.store.set(snap.id, { ...snap });
    this.byDept.set(InMemoryBudgetRepository.deptKey(snap.departmentId, snap.period), snap.id);
  }

  async findById(id: BudgetId): Promise<DepartmentalBudget | null> {
    const props = this.store.get(id);
    return props ? DepartmentalBudget.rehydrate({ ...props }) : null;
  }

  async findForDepartment(
    departmentId: DepartmentId,
    period: Period,
  ): Promise<DepartmentalBudget | null> {
    const id = this.byDept.get(InMemoryBudgetRepository.deptKey(departmentId, period));
    if (!id) return null;
    return this.findById(id);
  }
}
