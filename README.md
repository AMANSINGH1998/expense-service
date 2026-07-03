# Expense Service

A production-shaped **prototype** of an expense/reimbursement backend built with
**Domain-Driven Design** (Zenith-style layering) and **SOLID** principles. All
external dependencies (DB, FX provider, distributed lock, accounting ledger) are
mocked in-memory behind ports, so the real domain logic runs end-to-end.

Employees record monthly expenses (possibly in a foreign currency) and tag them
for reimbursement. A **dynamic, config-driven policy engine** decides each
expense's outcome; qualifying expenses are auto-approved against a departmental
budget in the employer's currency.

## Run it

```bash
npm install
npm run demo        # runnable end-to-end scenario (prints the flow)
npm test            # 50 tests incl. concurrency/locking proof
npm run typecheck   # strict TS, no emit
```

> Requires Node 18+ (developed on Node 25). If your default `node` is older,
> the scripts still work under a newer install, e.g. Homebrew's
> `/usr/local/opt/node/bin`.

## Outcomes

An expense is **persisted first** as `SUBMITTED`. Its state is updated **only
after policy validation**, inside a **lock keyed on `policyId`** (minimal
critical section):

| Outcome        | Meaning                                                       |
|----------------|---------------------------------------------------------------|
| `APPROVED`     | Policy auto-approves and budget + monthly cap are satisfied    |
| `PENDING`      | Policy requires manual approval by the employer                |
| `NON_APPROVED` | No policy rule applies                                         |
| `REJECTED`     | Policy rejects (or budget/cap breach)                          |

## Architecture (layers)

Domains never import each other; only the `application` layer orchestrates
across them. Domain code is pure — all I/O is a port implemented in
`infrastructure`. The composition root is the only place concretes are wired.

```
src/
  shared/          Money, Currency, ids, Result, DomainError, Period  (shared kernel)
  domain/
    expense/       Expense, ExpenseStatus, ExpenseLedger, LedgerEntry, ExpenseRepository
    policy/        Policy, Rule, OperatorRegistry, FieldCatalog, PolicyEvaluator, PolicyDecision
    budget/        DepartmentalBudget, BudgetRepository
    reimbursement/ ReimbursementTransaction, ReimbursementRepository
    accounting/    Account, JournalEntry (double-entry), AccountingLedger (port)
  application/
    ports/         FxRateProvider, LockManager, Clock, IdGenerator
    services/      ReimbursementManager, expense-facts
    usecases/      SubmitExpense, ReviewExpense, ConfigurePolicy
  infrastructure/  in-memory repos, MockFxRateProvider, keyed-mutex lock, clock, ids
  composition-root.ts   dependency injection / wiring
  demo/            fixtures + runnable main
```

## Submit flow

1. Build `Expense` (`SUBMITTED`) and **persist first**.
2. Load policy + budget + the employee's expense ledger; **FX-convert** to
   budget currency; evaluate the policy **outside the lock** (read-only work).
3. **Lock on `policyId`** → re-read fresh budget/ledger, **re-evaluate** on fresh
   facts, then perform the single state transition. For `AUTO_APPROVE`: deduct
   budget, record a reimbursement + a **balanced double-entry journal** + append
   a ledger entry. Critical section stays minimal.

## Dynamic policy engine

Config is a priority-ordered list of rules (first match wins). Each rule names a
code-registered **operator** and **field**; config only selects and
parameterizes logic that lives in code, so behaviour stays static and config is
extendable. Unknown operators/fields are rejected at **configure time**.

```jsonc
{
  "name": "auto-approve-small",
  "priority": 10,
  "conditionLogic": "AND",
  "conditions": [
    { "field": "amountInBudgetCurrency", "operator": "lte", "value": 50 },
    { "field": "category", "operator": "in", "value": ["MEALS", "TRAVEL"] }
  ],
  "action": "AUTO_APPROVE"
}
```

Add an operator → register one function in `OperatorRegistry`. Add a fact →
register it in `FieldCatalog` + populate it in `buildExpenseFacts`.

## The expense ledger as a validation source

The `expense` domain owns an `ExpenseLedger` of settled reimbursements. Its
`totalReimbursedIn(period)` feeds the `cumulativeReimbursedThisMonth` /
`cumulativeIncludingThisClaim` facts, so a monthly-cap rule pushes further
claims to `REJECTED` as an employee keeps adding claims.

## Concurrency

`LockManager` is a keyed async mutex (swap for Redis/DB advisory lock in prod).
`tests/concurrency.test.ts` fires 10 concurrent submissions against a budget
that affords 3, asserts no overspend **with** the lock, and demonstrates the
lost-update overspend **without** it.

## Out of scope (YAGNI)

Auth/roles, notifications, real HTTP/DB, multi-tenant, and penalties (a breach is
simply `REJECTED`). Identities are passed into commands. See
`docs/superpowers/specs/2026-07-03-expense-service-design.md` for the full design.
```
