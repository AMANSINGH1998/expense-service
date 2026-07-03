import { Money, type Currency } from "../../shared/money.js";
import type { JournalEntryId } from "../../shared/ids.js";
import { DomainError } from "../../shared/result.js";
import type { Account } from "./account.js";

/** One posting line: typically either debit or credit is zero. */
export interface JournalLine {
  readonly account: Account;
  readonly debit: Money;
  readonly credit: Money;
}

/**
 * The parties / source document a posting relates to. Kept as plain string ids
 * so the accounting domain stays decoupled from the expense/reimbursement
 * domains (it references them, it doesn't depend on their types).
 */
export interface JournalReference {
  readonly employeeId?: string;
  readonly employerId?: string;
  readonly expenseId?: string;
  readonly reimbursementId?: string;
}

interface JournalEntryProps {
  readonly id: JournalEntryId;
  readonly narration: string;
  readonly postedAt: Date;
  readonly currency: Currency;
  readonly lines: JournalLine[];
  readonly reference?: JournalReference;
}

interface SimpleTransferProps {
  readonly id: JournalEntryId;
  readonly narration: string;
  readonly postedAt: Date;
  readonly debitAccount: Account;
  readonly creditAccount: Account;
  readonly amount: Money;
  readonly reference?: JournalReference;
}

/** Immutable snapshot of a journal entry for persistence/serialization. */
export interface JournalEntrySnapshot {
  readonly id: JournalEntryId;
  readonly narration: string;
  readonly postedAt: Date;
  readonly currency: Currency;
  readonly lines: JournalLine[];
  readonly totalDebits: number;
  readonly totalCredits: number;
  readonly reference: JournalReference;
}

/**
 * A balanced double-entry journal entry. Balance (debits === credits) is an
 * invariant enforced at creation time — an unbalanced entry cannot exist.
 */
export class JournalEntry {
  private constructor(
    private readonly _id: JournalEntryId,
    private readonly _narration: string,
    private readonly _postedAt: Date,
    private readonly _currency: Currency,
    private readonly _lines: JournalLine[],
    private readonly _reference: JournalReference,
  ) {}

  static create({
    id,
    narration,
    postedAt,
    currency,
    lines,
    reference = {},
  }: JournalEntryProps): JournalEntry {
    if (lines.length < 2) {
      throw new DomainError(
        "JOURNAL_EMPTY",
        "A journal entry needs at least two lines",
      );
    }

    let debits = Money.zero(currency);
    let credits = Money.zero(currency);
    for (const line of lines) {
      if (line.debit.currency !== currency || line.credit.currency !== currency) {
        throw new DomainError(
          "JOURNAL_CURRENCY_MISMATCH",
          `Every line must be in ${currency}`,
        );
      }
      // add() also currency-checks, but the explicit guard gives a clearer code.
      debits = debits.add(line.debit);
      credits = credits.add(line.credit);
    }

    if (debits.minorUnits !== credits.minorUnits) {
      throw new DomainError(
        "JOURNAL_UNBALANCED",
        `Debits (${debits.toString()}) must equal credits (${credits.toString()})`,
      );
    }
    if (!(debits.minorUnits > 0)) {
      throw new DomainError(
        "JOURNAL_UNBALANCED",
        "A journal entry must move a positive amount",
      );
    }

    return new JournalEntry(id, narration, postedAt, currency, [...lines], reference);
  }

  /** Build a balanced 2-line entry: debit one account, credit another. */
  static simpleTransfer({
    id,
    narration,
    postedAt,
    debitAccount,
    creditAccount,
    amount,
    reference = {},
  }: SimpleTransferProps): JournalEntry {
    const zero = Money.zero(amount.currency);
    return JournalEntry.create({
      id,
      narration,
      postedAt,
      currency: amount.currency,
      reference,
      lines: [
        { account: debitAccount, debit: amount, credit: zero },
        { account: creditAccount, debit: zero, credit: amount },
      ],
    });
  }

  get id(): JournalEntryId {
    return this._id;
  }

  get narration(): string {
    return this._narration;
  }

  get postedAt(): Date {
    return this._postedAt;
  }

  get currency(): Currency {
    return this._currency;
  }

  get lines(): readonly JournalLine[] {
    return this._lines;
  }

  /** The parties / source document this posting relates to. */
  get reference(): JournalReference {
    return this._reference;
  }

  totalDebits(): Money {
    return this._lines.reduce(
      (sum, line) => sum.add(line.debit),
      Money.zero(this._currency),
    );
  }

  totalCredits(): Money {
    return this._lines.reduce(
      (sum, line) => sum.add(line.credit),
      Money.zero(this._currency),
    );
  }

  isBalanced(): boolean {
    return this.totalDebits().minorUnits === this.totalCredits().minorUnits;
  }

  snapshot(): JournalEntrySnapshot {
    return {
      id: this._id,
      narration: this._narration,
      postedAt: this._postedAt,
      currency: this._currency,
      lines: [...this._lines],
      totalDebits: this.totalDebits().minorUnits,
      totalCredits: this.totalCredits().minorUnits,
      reference: { ...this._reference },
    };
  }
}
