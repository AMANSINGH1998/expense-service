import { Money, Currency } from "../../shared/money.js";
import {
  EmployeeId,
  asDepartmentId,
  asEmployeeId,
  asEmployerId,
  asExpenseId,
  asPolicyId,
} from "../../shared/ids.js";
import { DomainError, Result, err, ok } from "../../shared/result.js";
import { Expense, ExpenseCategory } from "../../domain/expense/expense.js";
import { ExpenseStatus } from "../../domain/expense/expense-status.js";
import { ExpenseRepository } from "../../domain/expense/expense-repository.js";
import { BudgetRepository } from "../../domain/budget/budget-repository.js";
import { DepartmentalBudget } from "../../domain/budget/departmental-budget.js";
import { Policy } from "../../domain/policy/policy.js";
import { PolicyRepository } from "../../domain/policy/policy-repository.js";
import { PolicyEvaluator } from "../../domain/policy/policy-evaluator.js";
import { PolicyDecision } from "../../domain/policy/policy-decision.js";
import { RuleAction } from "../../domain/policy/rule-action.js";
import { Clock } from "../ports/clock.js";
import { IdGenerator } from "../ports/id-generator.js";
import { LockManager } from "../ports/lock-manager.js";
import { FxRateProvider } from "../ports/fx-rate-provider.js";
import { ReimbursementManager } from "../services/reimbursement-manager.js";
import { buildExpenseFacts } from "../services/expense-facts.js";

export interface SubmitExpenseCommand {
  employeeId: string;
  employerId: string;
  departmentId: string;
  policyId: string;
  category: ExpenseCategory;
  amountMajor: number;
  currency: Currency;
  description: string;
}

export interface SubmitExpenseResult {
  expenseId: string;
  status: ExpenseStatus;
  decision: PolicyDecision;
  reimbursementId: string | null;
  amountInBudgetCurrency: string | null;
}

/** Internal shape of a finalized (in-lock) decision. */
interface Finalized {
  decision: PolicyDecision;
  reimbursementId: string | null;
}

/**
 * Orchestrates the full submit flow across domains. This is the only place the
 * expense, policy, budget, reimbursement and accounting domains meet — they
 * never import each other.
 *
 * Flow:
 *  1. Persist the expense FIRST as SUBMITTED.
 *  2. Load policy/budget/ledger, FX-convert, and evaluate the policy OUTSIDE
 *     the lock (the expensive, read-only work).
 *  3. Acquire a lock on the POLICY, then re-read fresh budget/ledger, re-evaluate
 *     on fresh facts, and perform the single state transition (+ budget deduction
 *     and reimbursement for auto-approve). The critical section is minimal.
 */
export class SubmitExpenseUseCase {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly policies: PolicyRepository,
    private readonly budgets: BudgetRepository,
    private readonly evaluator: PolicyEvaluator,
    private readonly fx: FxRateProvider,
    private readonly locks: LockManager,
    private readonly reimbursementManager: ReimbursementManager,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: SubmitExpenseCommand): Promise<Result<SubmitExpenseResult>> {
    // --- Step 0: validate the command before touching any domain. ---
    const invalid = this.validate(cmd);
    if (invalid) {
      return err(invalid);
    }
    const policyId = asPolicyId(cmd.policyId);

    // --- Step 1: build and PERSIST the expense first (status SUBMITTED). ---
    // Construction validates the amount and can throw; convert to a Result.
    let expense: Expense;
    try {
      expense = Expense.submit({
        id: asExpenseId(this.ids.next()),
        employeeId: asEmployeeId(cmd.employeeId),
        employerId: asEmployerId(cmd.employerId),
        departmentId: asDepartmentId(cmd.departmentId),
        policyId,
        category: cmd.category,
        amount: Money.of(cmd.amountMajor, cmd.currency),
        description: cmd.description,
        submittedAt: this.clock.now(),
      });
    } catch (e) {
      return this.fail(e, "INVALID_EXPENSE");
    }
    try {
      await this.expenses.save(expense);
    } catch (e) {
      return this.fail(e, "EXPENSE_PERSIST_FAILED");
    }

    // --- Step 2: gather context OUTSIDE the lock (read-only, may be expensive). ---
    const policy = await this.policies.findById(policyId);
    if (!policy) {
      // Config error: the expense stays SUBMITTED (recorded, unprocessed).
      return err(new DomainError("POLICY_NOT_FOUND", `Policy ${cmd.policyId} not found`));
    }

    const budget = await this.budgets.findForDepartment(expense.departmentId, expense.period);
    if (!budget) {
      return err(
        new DomainError(
          "BUDGET_NOT_FOUND",
          `No budget for department ${cmd.departmentId} in ${expense.period.key}`,
        ),
      );
    }

    // FX conversion can throw when a rate is unconfigured — surface it cleanly.
    let amountInBudgetCurrency: Money;
    try {
      amountInBudgetCurrency = this.fx.convert(expense.amount, budget.currency);
    } catch (e) {
      return this.fail(e, "FX_CONVERSION_FAILED");
    }

    // Optimistic evaluation (telemetry / fail-fast only — not authoritative).
    // A misconfigured rule (e.g. a numeric operator on a text field) throws
    // here; treat it as a policy-evaluation failure rather than crashing.
    try {
      this.evaluate(
        policy,
        expense,
        amountInBudgetCurrency,
        budget,
        await this.loadCumulative(expense.employeeId, budget.currency, expense),
      );
    } catch (e) {
      return this.fail(e, "POLICY_EVALUATION_FAILED");
    }

    // --- Step 3: minimal critical section, locked on the POLICY. ---
    // A department's expenses are governed by a single policy, so serializing
    // per-policy serializes the budget/ledger reads-and-writes behind the
    // decision. Only fresh reads + one state transition happen in here. Any
    // failure inside the lock is converted to a Result so execute never rejects.
    let finalized: Finalized;
    try {
      finalized = await this.locks.withLock<Finalized>(`policy:${policyId}`, () =>
        this.finalizeUnderLock(policy, expense, amountInBudgetCurrency),
      );
    } catch (e) {
      return this.fail(e, "EXPENSE_PROCESSING_FAILED");
    }

    return ok({
      expenseId: expense.id,
      status: expense.status,
      decision: finalized.decision,
      reimbursementId: finalized.reimbursementId,
      amountInBudgetCurrency:
        finalized.reimbursementId !== null ? amountInBudgetCurrency.toString() : null,
    });
  }

  /** Validate the raw command. Returns a DomainError to return, or null if ok. */
  private validate(cmd: SubmitExpenseCommand): DomainError | null {
    const required: Array<keyof SubmitExpenseCommand> = [
      "employeeId",
      "employerId",
      "departmentId",
      "policyId",
      "currency",
    ];
    for (const field of required) {
      const value = cmd[field];
      if (typeof value !== "string" || value.trim() === "") {
        return new DomainError("INVALID_COMMAND", `Missing or empty field: ${field}`);
      }
    }
    if (
      typeof cmd.amountMajor !== "number" ||
      !Number.isFinite(cmd.amountMajor) ||
      cmd.amountMajor <= 0
    ) {
      return new DomainError("INVALID_COMMAND", "amountMajor must be a positive, finite number");
    }
    const categories: ExpenseCategory[] = ["MEALS", "TRAVEL", "LODGING", "SOFTWARE", "OTHER"];
    if (!categories.includes(cmd.category)) {
      return new DomainError("INVALID_COMMAND", `Unknown expense category: ${cmd.category}`);
    }
    return null;
  }

  /**
   * Turn a caught throwable into a Result error. Known DomainErrors keep their
   * own code (they are already meaningful); anything else is wrapped with the
   * supplied fallback code so the caller still gets a typed error.
   */
  private fail(e: unknown, fallbackCode: string): Result<SubmitExpenseResult> {
    if (e instanceof DomainError) {
      return err(e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return err(new DomainError(fallbackCode, message));
  }

  /** Runs inside the lock: fresh re-read, authoritative re-evaluation, one write. */
  private async finalizeUnderLock(
    policy: Policy,
    expense: Expense,
    amountInBudgetCurrency: Money,
  ): Promise<Finalized> {
    const freshBudget = await this.budgets.findForDepartment(
      expense.departmentId,
      expense.period,
    );
    if (!freshBudget) {
      const decision: PolicyDecision = {
        action: RuleAction.NOT_APPLICABLE,
        matchedRuleName: null,
        reason: "Budget disappeared before finalization",
      };
      await this.persistTransition(expense, () =>
        expense.markNonApproved(decision.reason, decision.matchedRuleName),
      );
      return { decision, reimbursementId: null };
    }

    const cumulative = await this.loadCumulative(
      expense.employeeId,
      freshBudget.currency,
      expense,
    );
    const decision = this.evaluate(
      policy,
      expense,
      amountInBudgetCurrency,
      freshBudget,
      cumulative,
    );

    switch (decision.action) {
      case RuleAction.AUTO_APPROVE:
        return this.applyAutoApprove(expense, freshBudget, amountInBudgetCurrency, decision);
      case RuleAction.MANUAL_REVIEW:
        await this.persistTransition(expense, () =>
          expense.markPending(decision.reason, decision.matchedRuleName),
        );
        return { decision, reimbursementId: null };
      case RuleAction.REJECT:
        await this.persistTransition(expense, () =>
          expense.reject(decision.reason, decision.matchedRuleName),
        );
        return { decision, reimbursementId: null };
      case RuleAction.NOT_APPLICABLE:
      default:
        await this.persistTransition(expense, () =>
          expense.markNonApproved(decision.reason, decision.matchedRuleName),
        );
        return { decision, reimbursementId: null };
    }
  }

  /** Auto-approve: deduct budget under lock, then record reimbursement. */
  private async applyAutoApprove(
    expense: Expense,
    budget: DepartmentalBudget,
    amountInBudgetCurrency: Money,
    decision: PolicyDecision,
  ): Promise<Finalized> {
    // Snapshot the budget BEFORE mutating so we can compensate on a later failure.
    const budgetBeforeDeduction = budget.snapshot();

    const deducted = budget.deduct(amountInBudgetCurrency);
    if (!deducted.ok) {
      // Budget cannot cover it right now -> reject rather than auto-approve.
      const rejectDecision: PolicyDecision = {
        action: RuleAction.REJECT,
        matchedRuleName: decision.matchedRuleName,
        reason: `Auto-approve blocked: ${deducted.error.message}`,
      };
      await this.persistTransition(expense, () =>
        expense.reject(rejectDecision.reason, rejectDecision.matchedRuleName),
      );
      return { decision: rejectDecision, reimbursementId: null };
    }

    // Do the in-memory transition first: if it fails, nothing has been persisted
    // yet, so there is nothing to roll back.
    const approved = expense.approve(decision.reason, decision.matchedRuleName);
    if (!approved.ok) {
      throw approved.error;
    }

    // Persist in an order that avoids leaving an APPROVED expense with no
    // reimbursement: save the budget, record the money movement, then write the
    // expense's terminal state LAST. If any step throws, compensate by rolling
    // the budget back to its pre-deduction state.
    //
    // NOTE: fully atomic cross-aggregate writes require a transactional outbox /
    // unit-of-work at the infrastructure boundary; this is a best-effort
    // compensation suitable for the in-memory prototype.
    try {
      await this.budgets.save(budget);
      const txn = await this.reimbursementManager.recordApprovedReimbursement(
        expense,
        amountInBudgetCurrency,
      );
      await this.expenses.save(expense);
      return { decision, reimbursementId: txn.id };
    } catch (e) {
      await this.safeRestoreBudget(budgetBeforeDeduction);
      throw e;
    }
  }

  /** Best-effort restore of a budget to a prior snapshot (compensation). */
  private async safeRestoreBudget(
    props: ReturnType<DepartmentalBudget["snapshot"]>,
  ): Promise<void> {
    try {
      await this.budgets.save(DepartmentalBudget.rehydrate({ ...props }));
    } catch {
      // Nothing more we can safely do here; the outer error is already bubbling.
    }
  }

  /** Apply a domain transition and persist; domain errors surface as throws. */
  private async persistTransition(
    expense: Expense,
    transition: () => Result<Expense>,
  ): Promise<void> {
    const r = transition();
    if (!r.ok) {
      throw r.error;
    }
    await this.expenses.save(expense);
  }

  private evaluate(
    policy: Policy,
    expense: Expense,
    amountInBudgetCurrency: Money,
    budget: DepartmentalBudget,
    cumulative: Money,
  ): PolicyDecision {
    const facts = buildExpenseFacts({
      expense,
      amountInBudgetCurrency,
      budget,
      cumulativeReimbursedThisMonth: cumulative,
    });
    return this.evaluator.evaluate(policy, facts);
  }

  private async loadCumulative(
    employeeId: EmployeeId,
    currency: Currency,
    expense: Expense,
  ): Promise<Money> {
    const ledger = await this.expenses.loadLedger(employeeId);
    return ledger.totalReimbursedIn(expense.period, currency);
  }
}
