# Expense Service — Design

Date: 2026-07-03
Status: Approved (implementation authorized)

## 1. Purpose

A backend service where **employees** record monthly expenses and tag them for
reimbursement from their **employer**. The employer may live in a different
geography/currency (e.g. USA vs India) and approves/views amounts against a
**departmental budget**. A **dynamic, config-driven policy engine** decides each
expense's outcome; qualifying expenses are **auto-approved**.

This is a production-shaped **prototype**: real domain logic, SOLID + DDD, with
all external dependencies (DB, FX provider, distributed lock, ledger) mocked
in-memory behind ports.

## 2. Outcomes (state machine)

An expense is **persisted first** as `SUBMITTED`. Its state is updated **only
after policy validation**, and the state update happens **inside a lock keyed on
`policyId`** (minimal critical section).

| Outcome        | Meaning                                                         |
|----------------|----------------------------------------------------------------|
| `APPROVED`     | Policy allows auto-approval and budget/ledger caps are satisfied |
| `PENDING`      | Policy requires manual approval by the employer                |
| `NON_APPROVED` | No policy rule applies to this expense                         |
| `REJECTED`     | Policy explicitly rejects (incl. budget/ledger breach)         |

Valid transitions: `SUBMITTED → {APPROVED, PENDING, NON_APPROVED, REJECTED}`,
and `PENDING → {APPROVED, REJECTED}` (via manual review). Terminal states are
immutable.

## 3. Architecture (Zenith DDD)

Strict layering. **Domains never import each other.** Only the `application`
layer orchestrates across domains. Domain code is pure (no I/O); all I/O is a
port implemented in `infrastructure`.

```
shared/          Money, Currency, ids, Result, DomainError, Period   (shared kernel)
domain/
  expense/       Expense (aggregate), ExpenseStatus, ExpenseLedger, LedgerEntry, ExpenseRepository
  policy/        Policy, Rule, RuleCondition, OperatorRegistry, RuleAction, PolicyEvaluator, PolicyDecision
  budget/        DepartmentalBudget, BudgetRepository
  reimbursement/ ReimbursementTransaction, ReimbursementRepository
  accounting/    Account, JournalEntry (double-entry), AccountingLedger (port)
application/
  ports/         FxRateProvider, LockManager, Clock, IdGenerator
  services/      ReimbursementManager
  usecases/      SubmitExpenseUseCase, ReviewExpenseUseCase, ConfigurePolicyUseCase
infrastructure/  in-memory repos, MockFxRateProvider, keyed-mutex InMemoryLockManager, SystemClock, UuidGenerator
demo/            main.ts
```

## 4. Submit flow

1. Build `Expense` in `SUBMITTED`; **persist first**.
2. Load `Policy` by `policyId` and the employee's `ExpenseLedger`.
3. Convert amount → budget currency via `FxRateProvider` (mock).
4. Build an evaluation **fact context** (amount in budget currency, category,
   budget remaining, cumulative reimbursed this month from the ledger, …).
5. **`PolicyEvaluator.evaluate` (pure, outside the lock)** → `PolicyDecision`
   with one action: `AUTO_APPROVE | MANUAL_REVIEW | REJECT | NOT_APPLICABLE`.
6. **Acquire lock on `policyId`.** Inside:
   - `AUTO_APPROVE`: re-check budget remaining + monthly ledger cap under the
     lock. If ok → `APPROVED`: deduct budget, `ReimbursementManager` records a
     reimbursement transaction + a **balanced double-entry journal** + appends a
     ledger entry. If the re-check fails → `REJECTED`.
   - `MANUAL_REVIEW` → `PENDING`.
   - `REJECT` → `REJECTED`.
   - `NOT_APPLICABLE` → `NON_APPROVED`.
   - Persist the state transition.
7. Release lock. Return the decision + persisted expense.

The expensive evaluation is outside the lock; only the re-check + state write +
budget deduction are inside it → **minimal lock**.

## 5. Policy engine (dynamic config, static code)

Config is a priority-ordered list of rules; **first match wins**. Each rule:

```jsonc
{
  "name": "auto-approve-small-meals",
  "priority": 10,
  "conditionLogic": "AND",          // AND | OR
  "conditions": [
    { "field": "amountInBudgetCurrency", "operator": "lte", "value": 50 },
    { "field": "category", "operator": "eq", "value": "MEALS" }
  ],
  "action": "AUTO_APPROVE"          // AUTO_APPROVE | MANUAL_REVIEW | REJECT | NOT_APPLICABLE
}
```

- **Operators** (`eq, neq, gt, gte, lt, lte, in, notIn`) live in an
  `OperatorRegistry` in code. Adding an operator = registering one function.
- **Fields** are resolved from the fact context by a `FactResolver` map in code.
- Config only *names and parameterizes* code; it never executes arbitrary code.
  → policy behaviour is **as static as possible**, config is **extendable**.
- Unknown operator/field in config fails **validation at configure time**
  (`ConfigurePolicyUseCase`), never silently at evaluation time.

## 6. Expense ledger as a validation source

The `expense` domain owns an `ExpenseLedger` (collection of `LedgerEntry`
records — one per approved reimbursement for an employee). It provides
`totalReimbursedIn(period, currency)`. This feeds the
`cumulativeReimbursedThisMonth` fact so that as an employee keeps adding claims,
a monthly cap rule can push further claims to `REJECTED`/`PENDING`.

## 7. Currency

`Money` is an immutable value object (integer minor units + currency). Expenses
are stored in original currency and converted to budget currency at evaluation
/ approval time via `FxRateProvider`. No floating-point money arithmetic.

## 8. Accounting

Every approval posts a **balanced double-entry** `JournalEntry` via the
`AccountingLedger` port: debit the department's expense account, credit the
employee-payable account, in budget currency. The in-memory ledger asserts total
debits == total credits.

## 9. Concurrency guarantee

`LockManager` is a keyed async mutex. A test fires N concurrent submissions
against a budget that only affords some of them and asserts the budget is never
overdrawn and the count of `APPROVED` matches affordability.

## 10. Out of scope (YAGNI)

Auth/roles, notifications, real HTTP/DB, multi-tenant, and penalties (a breach is
simply `REJECTED`). Identities are passed into commands.
