import { Money } from "../../shared/money.js";
import { asJournalEntryId, asReimbursementId } from "../../shared/ids.js";
import { Expense } from "../../domain/expense/expense.js";
import { ExpenseRepository } from "../../domain/expense/expense-repository.js";
import { LedgerEntry } from "../../domain/expense/ledger-entry.js";
import {
  ReimbursementTransaction,
} from "../../domain/reimbursement/reimbursement-transaction.js";
import { ReimbursementRepository } from "../../domain/reimbursement/reimbursement-repository.js";
import { JournalEntry } from "../../domain/accounting/journal-entry.js";
import { ACCOUNTS } from "../../domain/accounting/account.js";
import { AccountingLedger } from "../../domain/accounting/accounting-ledger.js";
import { Clock } from "../ports/clock.js";
import { IdGenerator } from "../ports/id-generator.js";

/**
 * Application service that turns an approved expense into money movement. It is
 * the single place that coordinates three domains (reimbursement, accounting,
 * expense-ledger) — none of which know about each other. It records:
 *   1. a ReimbursementTransaction (the obligation to pay the employee),
 *   2. a balanced double-entry journal (debit dept expense / credit payable),
 *   3. a ledger entry in the expense domain (feeds cumulative-cap validation).
 */
export class ReimbursementManager {
  constructor(
    private readonly reimbursements: ReimbursementRepository,
    private readonly accounting: AccountingLedger,
    private readonly expenses: ExpenseRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * Record the reimbursement for an approved expense. `amountInBudgetCurrency`
   * is the FX-converted amount (already validated against the budget by the
   * caller inside the lock). Returns the created transaction.
   */
  async recordApprovedReimbursement(
    expense: Expense,
    amountInBudgetCurrency: Money,
  ): Promise<ReimbursementTransaction> {
    const now = this.clock.now();

    const txn = ReimbursementTransaction.record({
      id: asReimbursementId(this.ids.next()),
      expenseId: expense.id,
      employeeId: expense.employeeId,
      employerId: expense.employerId,
      amount: amountInBudgetCurrency,
      createdAt: now,
    });
    await this.reimbursements.save(txn);

    // Double-entry: the department incurs an expense; the company owes the
    // employee (a liability) until the reimbursement is settled/paid.
    const journal = JournalEntry.simpleTransfer({
      id: asJournalEntryId(this.ids.next()),
      narration: `Reimbursement for expense ${expense.id}`,
      postedAt: now,
      debitAccount: ACCOUNTS.DEPARTMENT_EXPENSE,
      creditAccount: ACCOUNTS.EMPLOYEE_PAYABLE,
      amount: amountInBudgetCurrency,
      // Attribute the posting to the parties + source documents.
      reference: {
        employeeId: expense.employeeId,
        employerId: expense.employerId,
        expenseId: expense.id,
        reimbursementId: txn.id,
      },
    });
    await this.accounting.post(journal);

    // Record in the expense domain's own ledger so future claims see the
    // updated cumulative total.
    const ledgerEntry: LedgerEntry = {
      reimbursementId: txn.id,
      expenseId: expense.id,
      employeeId: expense.employeeId,
      amount: amountInBudgetCurrency,
      period: expense.period,
      recordedAt: now,
    };
    await this.expenses.appendLedgerEntry(ledgerEntry);

    return txn;
  }
}
