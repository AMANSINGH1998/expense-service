import type { BudgetId, DepartmentId } from "../../shared/ids.js";
import type { Period } from "../../shared/period.js";
import type { DepartmentalBudget } from "./departmental-budget.js";

/**
 * Port for persisting and retrieving DepartmentalBudget aggregates.
 * Infrastructure supplies the concrete adapter; the domain depends only on
 * this interface.
 */
export interface BudgetRepository {
  findById(id: BudgetId): Promise<DepartmentalBudget | null>;
  findForDepartment(
    departmentId: DepartmentId,
    period: Period,
  ): Promise<DepartmentalBudget | null>;
  save(budget: DepartmentalBudget): Promise<void>;
}
