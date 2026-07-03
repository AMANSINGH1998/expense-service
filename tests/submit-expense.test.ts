import { describe, it, expect, beforeEach } from "vitest";
import { Period } from "../src/shared/period.js";
import { buildExpenseService, ExpenseServiceContext } from "../src/composition-root.js";
import { FixedClock } from "../src/infrastructure/system/system-clock.js";
import { SequentialIdGenerator } from "../src/infrastructure/system/id-generator.js";
import { SAMPLE_POLICY, seedBudget } from "../src/demo/fixtures.js";
import { ExpenseStatus } from "../src/domain/expense/expense-status.js";
import type { SubmitExpenseCommand } from "../src/application/usecases/submit-expense.js";

const PERIOD = Period.of(2026, 7);

async function setup(allocatedMajor = 5000): Promise<ExpenseServiceContext> {
  const svc = buildExpenseService({
    clock: new FixedClock(new Date("2026-07-15T10:00:00Z")),
    ids: new SequentialIdGenerator("exp"),
    fxRates: { "INR->USD": 0.012 },
  });
  const cfg = await svc.configurePolicy.execute(SAMPLE_POLICY);
  expect(cfg.ok).toBe(true);
  await seedBudget(svc.repos.budgets, {
    id: "b1",
    departmentId: "eng",
    employerId: "acme-usa",
    period: PERIOD,
    currency: "USD",
    allocatedMajor,
  });
  return svc;
}

const cmd = (over: Partial<SubmitExpenseCommand>): SubmitExpenseCommand => ({
  employeeId: "emp-1",
  employerId: "acme-usa",
  departmentId: "eng",
  policyId: "policy-usa-eng",
  category: "TRAVEL",
  amountMajor: 100,
  currency: "USD",
  description: "x",
  ...over,
});

describe("SubmitExpenseUseCase", () => {
  let svc: ExpenseServiceContext;
  beforeEach(async () => {
    svc = await setup();
  });

  it("persists the expense first as SUBMITTED (record before processing)", async () => {
    const r = await svc.submitExpense.execute(cmd({ category: "MEALS", amountMajor: 10 }));
    expect(r.ok).toBe(true);
    // After processing it is no longer SUBMITTED, but it exists in the store.
    expect(svc.repos.expenses.all().length).toBe(1);
  });

  it("AUTO_APPROVEs a small in-policy expense and records a reimbursement", async () => {
    const r = await svc.submitExpense.execute(cmd({ category: "MEALS", amountMajor: 30 }));
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.APPROVED);
    expect(r.value.decision.matchedRuleName).toBe("auto-approve-small");
    expect(r.value.reimbursementId).not.toBeNull();
    // budget was deducted and accounting stayed balanced
    const budget = await svc.repos.budgets.findForDepartment("eng" as never, PERIOD);
    expect(budget?.remaining().amountMajor).toBe(4970);
    expect(svc.repos.accounting.isGloballyBalanced()).toBe(true);
    expect(svc.repos.accounting.totalPosted("USD").amountMajor).toBe(30);
  });

  it("converts foreign currency at approval time (INR -> USD)", async () => {
    const r = await svc.submitExpense.execute(
      cmd({ category: "MEALS", amountMajor: 2500, currency: "INR" }),
    );
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.APPROVED);
    // 2500 INR * 0.012 = 30 USD reimbursed / posted
    expect(r.value.amountInBudgetCurrency).toBe("30.00 USD");
    expect(svc.repos.accounting.totalPosted("USD").amountMajor).toBe(30);
  });

  it("marks PENDING when policy requires manual review", async () => {
    const r = await svc.submitExpense.execute(cmd({ category: "LODGING", amountMajor: 700 }));
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.PENDING);
    expect(r.value.decision.matchedRuleName).toBe("manual-review-large");
    expect(r.value.reimbursementId).toBeNull();
    // no money moved yet
    expect(svc.repos.accounting.totalPosted("USD").amountMajor).toBe(0);
  });

  it("marks NON_APPROVED when no rule applies", async () => {
    const r = await svc.submitExpense.execute(cmd({ category: "OTHER", amountMajor: 40 }));
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.NON_APPROVED);
    expect(r.value.decision.matchedRuleName).toBeNull();
    expect(r.value.reimbursementId).toBeNull();
  });

  it("REJECTs when the cumulative monthly cap (from the ledger) is breached", async () => {
    // First $500 travel auto-approves and lands in the ledger.
    const first = await svc.submitExpense.execute(
      cmd({ employeeId: "dave", category: "TRAVEL", amountMajor: 500 }),
    );
    if (!first.ok) throw first.error;
    expect(first.value.status).toBe(ExpenseStatus.APPROVED);

    // Next $600 pushes the month's total to $1100 (> $1000 cap) -> REJECTED.
    const second = await svc.submitExpense.execute(
      cmd({ employeeId: "dave", category: "TRAVEL", amountMajor: 600 }),
    );
    if (!second.ok) throw second.error;
    expect(second.value.status).toBe(ExpenseStatus.REJECTED);
    expect(second.value.decision.matchedRuleName).toBe("reject-over-monthly-cap");
  });

  it("REJECTs an auto-approvable expense when the budget cannot cover it", async () => {
    const tiny = await setup(20); // only $20 allocated
    const r = await tiny.submitExpense.execute(cmd({ category: "MEALS", amountMajor: 30 }));
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.REJECTED);
    expect(r.value.decision.reason).toMatch(/Auto-approve blocked/);
    expect(tiny.repos.accounting.totalPosted("USD").amountMajor).toBe(0);
  });

  it("returns POLICY_NOT_FOUND but still records the expense", async () => {
    const r = await svc.submitExpense.execute(cmd({ policyId: "does-not-exist" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("POLICY_NOT_FOUND");
    expect(svc.repos.expenses.all().length).toBe(1);
  });
});
