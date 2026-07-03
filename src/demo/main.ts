import { Period } from "../shared/period.js";
import { buildExpenseService } from "../composition-root.js";
import { FixedClock } from "../infrastructure/system/system-clock.js";
import { SequentialIdGenerator } from "../infrastructure/system/id-generator.js";
import { seedBudget } from "./fixtures.js";
import type { PolicyConfig } from "../domain/policy/policy.js";
import type { SubmitExpenseCommand } from "../application/usecases/submit-expense.js";

const line = (s = "") => console.log(s);
const step = (n: number, s: string) => line(`\n[Step ${n}] ${s}`);

/**
 * Policy the EMPLOYER authors. It auto-approves travel up to $600, but rejects
 * any claim that would push the employee's running monthly total over $800.
 * The running total comes from the expense-tracker domain's ledger, so the
 * SAME claim submitted twice is approved the first time and rejected the second.
 */
const EMPLOYER_POLICY: PolicyConfig = {
  id: "policy-usa-eng",
  name: "US Engineering Reimbursement Policy",
  version: 1,
  rules: [
    {
      name: "reject-over-monthly-cap",
      priority: 5,
      conditions: [{ field: "cumulativeIncludingThisClaim", operator: "gt", value: 800 }],
      action: "REJECT",
    },
    {
      name: "auto-approve-travel",
      priority: 10,
      conditionLogic: "AND",
      conditions: [
        { field: "amountInBudgetCurrency", operator: "lte", value: 600 },
        { field: "category", operator: "in", value: ["TRAVEL", "LODGING", "MEALS"] },
      ],
      action: "AUTO_APPROVE",
    },
  ],
};

async function main() {
  const clock = new FixedClock(new Date("2026-07-15T10:00:00Z"));
  const svc = buildExpenseService({
    clock,
    ids: new SequentialIdGenerator("exp"),
    fxRates: { "INR->USD": 0.012 },
  });
  const period = Period.of(2026, 7);

  line("========================================================");
  line(" Expense Service — end-to-end run");
  line("========================================================");

  // --- EMPLOYER SIDE ------------------------------------------------------
  step(1, "Employer creates the policy config");
  const cfg = await svc.configurePolicy.execute(EMPLOYER_POLICY);
  if (!cfg.ok) throw cfg.error;
  line(`  ✓ Policy "${cfg.value.policyId}" saved (${EMPLOYER_POLICY.rules.length} rules).`);
  line(`    - auto-approve TRAVEL/LODGING/MEALS up to $600`);
  line(`    - reject once the employee's monthly total would exceed $800`);

  step(2, "Employer allocates a departmental budget (USD)");
  await seedBudget(svc.repos.budgets, {
    id: "budget-eng-2026-07",
    departmentId: "eng",
    employerId: "acme-usa",
    period,
    currency: "USD",
    allocatedMajor: 5000,
  });
  line("  ✓ ENG budget: 5000.00 USD for 2026-07.");

  const claim: SubmitExpenseCommand = {
    employeeId: "emp-alice",
    employerId: "acme-usa",
    departmentId: "eng",
    policyId: "policy-usa-eng",
    category: "TRAVEL",
    amountMajor: 500,
    currency: "USD",
    description: "Flight to client site",
  };

  // --- EMPLOYEE SIDE: first claim -> APPROVED + reimbursement --------------
  step(3, "Employee submits an expense and tags it for reimbursement");
  const first = await svc.submitExpense.execute(claim);
  if (!first.ok) throw first.error;
  line(`  Expense ${first.value.expenseId}: $500.00 TRAVEL`);
  line(`  ✓ Status: ${first.value.status}  (matched rule: ${first.value.decision.matchedRuleName})`);
  line(`  ✓ Reimbursement created: ${first.value.reimbursementId} for ${first.value.amountInBudgetCurrency}`);

  const budgetAfter1 = await svc.repos.budgets.findForDepartment("eng" as never, period);
  line(`  ✓ Budget deducted -> remaining ${budgetAfter1?.remaining().toString()}`);
  line(`  ✓ Accounting posted (debit dept expense / credit employee payable), balanced: ${svc.repos.accounting.isGloballyBalanced()}`);

  // --- EMPLOYEE SIDE: same claim again -> REJECTED ------------------------
  step(4, "Employee applies the SAME claim again");
  const second = await svc.submitExpense.execute(claim);
  if (!second.ok) throw second.error;
  line(`  Expense ${second.value.expenseId}: $500.00 TRAVEL`);
  line(`  ✗ Status: ${second.value.status}  (matched rule: ${second.value.decision.matchedRuleName})`);
  line(`    Reason: ${second.value.decision.reason}`);
  line(`    (Ledger already has $500 this month; $500 + $500 = $1000 > $800 cap.)`);
  line(`  ✗ No reimbursement created; no budget deducted.`);

  // --- SUMMARY ------------------------------------------------------------
  line("\n--------------------------------------------------------");
  line(" Final state");
  line("--------------------------------------------------------");
  const budget = await svc.repos.budgets.findForDepartment("eng" as never, period);
  line(`Budget remaining : ${budget?.remaining().toString()} (of ${budget?.allocated.toString()})`);
  line(`Reimbursements   : ${(await svc.repos.reimbursements.listForEmployee("emp-alice" as never)).length}`);
  line(`Ledger balanced  : ${svc.repos.accounting.isGloballyBalanced()}  |  posted ${svc.repos.accounting.totalPosted("USD").toString()}`);
  line("Expenses:");
  for (const e of svc.repos.expenses.all()) {
    line(`  ${e.id.padEnd(6)} ${e.category.padEnd(8)} ${e.amount.toString().padEnd(11)} -> ${e.status}`);
  }

  line("\nReimbursement transactions (with parties):");
  for (const t of await svc.repos.reimbursements.listForEmployee("emp-alice" as never)) {
    const s = t.snapshot();
    line(`  ${s.id.padEnd(6)} employee=${s.employeeId} employer=${s.employerId} ${s.amount.toString()} [${s.status}]`);
  }

  line("\nAccounting journal (double-entry, with parties):");
  for (const j of svc.repos.accounting.all()) {
    const s = j.snapshot();
    line(
      `  ${s.id.padEnd(6)} ${s.narration} | ${s.currency} ${(s.totalDebits / 100).toFixed(2)} ` +
        `| employee=${s.reference.employeeId} employer=${s.reference.employerId} expense=${s.reference.expenseId}`,
    );
    for (const l of s.lines) {
      const side = l.debit.minorUnits > 0 ? `DR ${l.debit.toString()}` : `CR ${l.credit.toString()}`;
      line(`         ${l.account.name.padEnd(30)} ${side}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
