import { describe, it, expect, beforeEach } from "vitest";
import { Period } from "../src/shared/period.js";
import { buildExpenseService, ExpenseServiceContext } from "../src/composition-root.js";
import { FixedClock } from "../src/infrastructure/system/system-clock.js";
import { SequentialIdGenerator } from "../src/infrastructure/system/id-generator.js";
import { SAMPLE_POLICY, seedBudget } from "../src/demo/fixtures.js";
import { ExpenseStatus } from "../src/domain/expense/expense-status.js";

const PERIOD = Period.of(2026, 7);

async function pendingExpense(): Promise<{ svc: ExpenseServiceContext; expenseId: string }> {
  const svc = buildExpenseService({
    clock: new FixedClock(new Date("2026-07-15T10:00:00Z")),
    ids: new SequentialIdGenerator("exp"),
    fxRates: {},
  });
  await svc.configurePolicy.execute(SAMPLE_POLICY);
  await seedBudget(svc.repos.budgets, {
    id: "b1",
    departmentId: "eng",
    employerId: "acme-usa",
    period: PERIOD,
    currency: "USD",
    allocatedMajor: 5000,
  });
  const r = await svc.submitExpense.execute({
    employeeId: "bob",
    employerId: "acme-usa",
    departmentId: "eng",
    policyId: "policy-usa-eng",
    category: "LODGING",
    amountMajor: 700,
    currency: "USD",
    description: "hotel",
  });
  if (!r.ok) throw r.error;
  expect(r.value.status).toBe(ExpenseStatus.PENDING);
  return { svc, expenseId: r.value.expenseId };
}

describe("ReviewExpenseUseCase", () => {
  let svc: ExpenseServiceContext;
  let expenseId: string;
  beforeEach(async () => {
    ({ svc, expenseId } = await pendingExpense());
  });

  it("approves a PENDING expense: deducts budget and records reimbursement", async () => {
    const r = await svc.reviewExpense.execute({
      expenseId,
      reviewerId: "manager",
      approve: true,
      note: "ok",
    });
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.APPROVED);
    expect(r.value.reimbursementId).not.toBeNull();
    const budget = await svc.repos.budgets.findForDepartment("eng" as never, PERIOD);
    expect(budget?.remaining().amountMajor).toBe(4300);
    expect(svc.repos.accounting.totalPosted("USD").amountMajor).toBe(700);
  });

  it("rejects a PENDING expense: no money moves", async () => {
    const r = await svc.reviewExpense.execute({
      expenseId,
      reviewerId: "manager",
      approve: false,
      note: "over budget",
    });
    if (!r.ok) throw r.error;
    expect(r.value.status).toBe(ExpenseStatus.REJECTED);
    expect(r.value.reimbursementId).toBeNull();
    expect(svc.repos.accounting.totalPosted("USD").amountMajor).toBe(0);
  });

  it("cannot review an expense that is not PENDING", async () => {
    // approve once...
    await svc.reviewExpense.execute({ expenseId, reviewerId: "m", approve: true, note: "" });
    // ...then a second review must fail.
    const again = await svc.reviewExpense.execute({
      expenseId,
      reviewerId: "m",
      approve: true,
      note: "",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("EXPENSE_NOT_PENDING");
  });
});
