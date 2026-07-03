import { Money, Currency } from "../shared/money.js";
import { Period } from "../shared/period.js";
import {
  asBudgetId,
  asDepartmentId,
  asEmployerId,
} from "../shared/ids.js";
import { DepartmentalBudget } from "../domain/budget/departmental-budget.js";
import { BudgetRepository } from "../domain/budget/budget-repository.js";
import { PolicyConfig } from "../domain/policy/policy.js";

/**
 * Example admin-authored policy. Demonstrates all four outcomes and every
 * facility of the engine: numeric thresholds, category membership (`in`), the
 * cumulative monthly cap sourced from the expense ledger, AND-combined
 * conditions, and priority ordering (first match wins).
 *
 * Rules by ascending priority:
 *   5  reject if this claim would push the month's total over 1000 (cap)
 *   10 auto-approve small (<=50) meals/travel/lodging/software
 *   20 manual review anything large (>500)
 *   30 auto-approve medium (<=500) travel/lodging/software
 *   (no match) -> NON_APPROVED
 */
export const SAMPLE_POLICY: PolicyConfig = {
  id: "policy-usa-eng",
  name: "US Engineering Reimbursement Policy",
  version: 1,
  rules: [
    {
      name: "reject-over-monthly-cap",
      priority: 5,
      conditions: [{ field: "cumulativeIncludingThisClaim", operator: "gt", value: 1000 }],
      action: "REJECT",
    },
    {
      name: "auto-approve-small",
      priority: 10,
      conditionLogic: "AND",
      conditions: [
        { field: "amountInBudgetCurrency", operator: "lte", value: 50 },
        { field: "category", operator: "in", value: ["MEALS", "TRAVEL", "LODGING", "SOFTWARE"] },
      ],
      action: "AUTO_APPROVE",
    },
    {
      name: "manual-review-large",
      priority: 20,
      conditions: [{ field: "amountInBudgetCurrency", operator: "gt", value: 500 }],
      action: "MANUAL_REVIEW",
    },
    {
      name: "auto-approve-medium",
      priority: 30,
      conditionLogic: "AND",
      conditions: [
        { field: "amountInBudgetCurrency", operator: "lte", value: 500 },
        { field: "category", operator: "in", value: ["TRAVEL", "LODGING", "SOFTWARE"] },
      ],
      action: "AUTO_APPROVE",
    },
  ],
};

/** Seed a departmental budget directly (budget creation is an admin concern). */
export async function seedBudget(
  repo: BudgetRepository,
  input: {
    id: string;
    departmentId: string;
    employerId: string;
    period: Period;
    currency: Currency;
    allocatedMajor: number;
  },
): Promise<void> {
  const budget = DepartmentalBudget.create({
    id: asBudgetId(input.id),
    departmentId: asDepartmentId(input.departmentId),
    employerId: asEmployerId(input.employerId),
    period: input.period,
    currency: input.currency,
    allocated: Money.of(input.allocatedMajor, input.currency),
  });
  if (!budget.ok) {
    throw budget.error;
  }
  await repo.save(budget.value);
}
