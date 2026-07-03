import { describe, it, expect } from "vitest";
import { Period } from "../src/shared/period.js";
import { buildExpenseService } from "../src/composition-root.js";
import { FixedClock } from "../src/infrastructure/system/system-clock.js";
import { SequentialIdGenerator } from "../src/infrastructure/system/id-generator.js";
import { SAMPLE_POLICY, seedBudget } from "../src/demo/fixtures.js";
import { ExpenseStatus } from "../src/domain/expense/expense-status.js";
import { LockManager } from "../src/application/ports/lock-manager.js";

const PERIOD = Period.of(2026, 7);

/** A lock manager that does NOT lock — used to expose the race it's meant to fix. */
class NoOpLockManager implements LockManager {
  async withLock<T>(_key: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/**
 * Fire N concurrent auto-approvable submissions against a budget that can only
 * afford a few, then count approvals and check the budget was never overdrawn.
 */
async function runConcurrent(opts: { locks?: LockManager }) {
  const svc = buildExpenseService({
    clock: new FixedClock(new Date("2026-07-15T10:00:00Z")),
    ids: new SequentialIdGenerator("exp"),
    fxRates: {},
    ...(opts.locks ? { locks: opts.locks } : {}),
  });
  await svc.configurePolicy.execute(SAMPLE_POLICY);
  // $100 budget; each claim is $30 -> at most 3 can be approved.
  await seedBudget(svc.repos.budgets, {
    id: "b1",
    departmentId: "eng",
    employerId: "acme-usa",
    period: PERIOD,
    currency: "USD",
    allocatedMajor: 100,
  });

  const submissions = Array.from({ length: 10 }, (_, i) =>
    svc.submitExpense.execute({
      employeeId: `emp-${i}`, // distinct employees: isolate budget contention from the per-employee cap
      employerId: "acme-usa",
      departmentId: "eng",
      policyId: "policy-usa-eng",
      category: "MEALS",
      amountMajor: 30,
      currency: "USD",
      description: "concurrent lunch",
    }),
  );
  const results = await Promise.all(submissions);
  const approved = results.filter((r) => r.ok && r.value.status === ExpenseStatus.APPROVED).length;
  const budget = await svc.repos.budgets.findForDepartment("eng" as never, PERIOD);
  const posted = svc.repos.accounting.totalPosted("USD").amountMajor;
  return { approved, remaining: budget!.remaining().amountMajor, posted, svc };
}

describe("concurrency / locking on policyId", () => {
  it("with the lock: budget is never overdrawn under concurrent submissions", async () => {
    const { approved, remaining, posted, svc } = await runConcurrent({});
    // Exactly 3 of the 10 fit within the $100 budget ($90 spent, $10 left).
    expect(approved).toBe(3);
    expect(remaining).toBe(10);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(posted).toBe(90);
    expect(svc.repos.accounting.isGloballyBalanced()).toBe(true);
  });

  it("without the lock: the read-modify-write races and overspends the budget", async () => {
    const { approved, posted } = await runConcurrent({ locks: new NoOpLockManager() });
    // The race is a lost-update: concurrent submissions all read the same
    // remaining balance, so more than the affordable 3 get approved and the
    // total reimbursed exceeds the $100 allocation. This is exactly the failure
    // the per-policy lock exists to prevent.
    expect(approved).toBeGreaterThan(3);
    expect(posted).toBeGreaterThan(100);
  });
});
