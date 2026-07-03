import { Money } from "../../shared/money.js";
import { FactContext } from "../../domain/policy/fact-context.js";
import { FieldCatalog } from "../../domain/policy/field-catalog.js";
import { Expense } from "../../domain/expense/expense.js";
import { DepartmentalBudget } from "../../domain/budget/departmental-budget.js";

/**
 * The canonical set of fact fields this application exposes to the policy
 * engine. Admins author rules against these names; anything else is rejected at
 * configure time. Adding a new fact = register it here + populate it in
 * `buildExpenseFacts`. (This is the application's half of the field contract;
 * the operator half lives in the domain's OperatorRegistry.)
 */
export const FACT_FIELDS = {
  amountInBudgetCurrency: "amountInBudgetCurrency",
  amountOriginal: "amountOriginal",
  originalCurrency: "originalCurrency",
  budgetCurrency: "budgetCurrency",
  category: "category",
  budgetAllocated: "budgetAllocated",
  budgetRemaining: "budgetRemaining",
  cumulativeReimbursedThisMonth: "cumulativeReimbursedThisMonth",
  /** cumulative-so-far + this claim; convenient for monthly-cap rules. */
  cumulativeIncludingThisClaim: "cumulativeIncludingThisClaim",
} as const;

/** Build the field catalog the policy engine validates config against. */
export function buildFieldCatalog(): FieldCatalog {
  return new FieldCatalog()
    .register(FACT_FIELDS.amountInBudgetCurrency, "number")
    .register(FACT_FIELDS.amountOriginal, "number")
    .register(FACT_FIELDS.originalCurrency, "string")
    .register(FACT_FIELDS.budgetCurrency, "string")
    .register(FACT_FIELDS.category, "string")
    .register(FACT_FIELDS.budgetAllocated, "number")
    .register(FACT_FIELDS.budgetRemaining, "number")
    .register(FACT_FIELDS.cumulativeReimbursedThisMonth, "number")
    .register(FACT_FIELDS.cumulativeIncludingThisClaim, "number");
}

/**
 * Assemble the fact context for one expense evaluation. Pure. Money values are
 * exposed in major units (e.g. dollars) so admins write intuitive thresholds.
 */
export function buildExpenseFacts(input: {
  expense: Expense;
  amountInBudgetCurrency: Money;
  budget: DepartmentalBudget;
  cumulativeReimbursedThisMonth: Money;
}): FactContext {
  const { expense, amountInBudgetCurrency, budget, cumulativeReimbursedThisMonth } = input;
  return {
    [FACT_FIELDS.amountInBudgetCurrency]: amountInBudgetCurrency.amountMajor,
    [FACT_FIELDS.amountOriginal]: expense.amount.amountMajor,
    [FACT_FIELDS.originalCurrency]: expense.amount.currency,
    [FACT_FIELDS.budgetCurrency]: budget.currency,
    [FACT_FIELDS.category]: expense.category,
    [FACT_FIELDS.budgetAllocated]: budget.allocated.amountMajor,
    [FACT_FIELDS.budgetRemaining]: budget.remaining().amountMajor,
    [FACT_FIELDS.cumulativeReimbursedThisMonth]: cumulativeReimbursedThisMonth.amountMajor,
    [FACT_FIELDS.cumulativeIncludingThisClaim]:
      cumulativeReimbursedThisMonth.add(amountInBudgetCurrency).amountMajor,
  };
}
