import { OperatorRegistry } from "./domain/policy/operator-registry.js";
import { FieldCatalog } from "./domain/policy/field-catalog.js";
import { PolicyEvaluator } from "./domain/policy/policy-evaluator.js";

import { Clock } from "./application/ports/clock.js";
import { IdGenerator } from "./application/ports/id-generator.js";
import { buildFieldCatalog } from "./application/services/expense-facts.js";
import { ReimbursementManager } from "./application/services/reimbursement-manager.js";
import { SubmitExpenseUseCase } from "./application/usecases/submit-expense.js";
import { ReviewExpenseUseCase } from "./application/usecases/review-expense.js";
import { ConfigurePolicyUseCase } from "./application/usecases/configure-policy.js";

import { InMemoryExpenseRepository } from "./infrastructure/persistence/in-memory-expense-repository.js";
import { InMemoryBudgetRepository } from "./infrastructure/persistence/in-memory-budget-repository.js";
import { InMemoryPolicyRepository } from "./infrastructure/persistence/in-memory-policy-repository.js";
import { InMemoryReimbursementRepository } from "./infrastructure/persistence/in-memory-reimbursement-repository.js";
import { InMemoryAccountingLedger } from "./infrastructure/persistence/in-memory-accounting-ledger.js";
import { MockFxRateProvider } from "./infrastructure/fx/mock-fx-rate-provider.js";
import { InMemoryLockManager } from "./infrastructure/locking/in-memory-lock-manager.js";
import { SystemClock } from "./infrastructure/system/system-clock.js";
import { UuidGenerator } from "./infrastructure/system/id-generator.js";
import { LockManager } from "./application/ports/lock-manager.js";

export interface BuildOptions {
  clock?: Clock;
  ids?: IdGenerator;
  /** FX rate table, e.g. { "INR->USD": 0.012 }. */
  fxRates?: Record<string, number>;
  /** Override the lock manager (e.g. a no-op to demonstrate races in tests). */
  locks?: LockManager;
}

export interface ExpenseServiceContext {
  submitExpense: SubmitExpenseUseCase;
  reviewExpense: ReviewExpenseUseCase;
  configurePolicy: ConfigurePolicyUseCase;
  operators: OperatorRegistry;
  fields: FieldCatalog;
  repos: {
    expenses: InMemoryExpenseRepository;
    budgets: InMemoryBudgetRepository;
    policies: InMemoryPolicyRepository;
    reimbursements: InMemoryReimbursementRepository;
    accounting: InMemoryAccountingLedger;
  };
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Composition root: the single place that instantiates concrete infrastructure
 * and injects it into the application layer. Everything above this file depends
 * only on ports/interfaces (Dependency Inversion), so swapping in a real DB,
 * FX API, or distributed lock is a change confined here.
 */
export function buildExpenseService(opts: BuildOptions = {}): ExpenseServiceContext {
  const clock: Clock = opts.clock ?? new SystemClock();
  const ids: IdGenerator = opts.ids ?? new UuidGenerator();

  const operators = OperatorRegistry.withDefaults();
  const fields = buildFieldCatalog();
  const evaluator = new PolicyEvaluator(operators);

  const expenses = new InMemoryExpenseRepository();
  const budgets = new InMemoryBudgetRepository();
  const policies = new InMemoryPolicyRepository();
  const reimbursements = new InMemoryReimbursementRepository();
  const accounting = new InMemoryAccountingLedger();

  const fx = MockFxRateProvider.withRates(opts.fxRates ?? {});
  const locks: LockManager = opts.locks ?? new InMemoryLockManager();

  const reimbursementManager = new ReimbursementManager(
    reimbursements,
    accounting,
    expenses,
    ids,
    clock,
  );

  const submitExpense = new SubmitExpenseUseCase(
    expenses,
    policies,
    budgets,
    evaluator,
    fx,
    locks,
    reimbursementManager,
    ids,
    clock,
  );

  const reviewExpense = new ReviewExpenseUseCase(
    expenses,
    budgets,
    fx,
    locks,
    reimbursementManager,
  );

  const configurePolicy = new ConfigurePolicyUseCase(policies, operators, fields);

  return {
    submitExpense,
    reviewExpense,
    configurePolicy,
    operators,
    fields,
    repos: { expenses, budgets, policies, reimbursements, accounting },
    clock,
    ids,
  };
}
