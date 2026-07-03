import { DomainError } from "./result.js";

/** ISO-4217-ish currency code. Kept as a string type for prototype simplicity. */
export type Currency = string;

/**
 * Immutable money value object stored in integer minor units (e.g. cents) to
 * avoid floating-point rounding errors. All arithmetic is currency-checked.
 */
export class Money {
  private constructor(
    /** Amount in the currency's minor unit (e.g. cents). */
    readonly minorUnits: number,
    readonly currency: Currency,
  ) {}

  static of(amountMajor: number, currency: Currency): Money {
    if (!Number.isFinite(amountMajor)) {
      throw new DomainError("MONEY_INVALID", `Invalid amount: ${amountMajor}`);
    }
    // Round to nearest minor unit; assumes 2 decimal places (sufficient here).
    return new Money(Math.round(amountMajor * 100), currency);
  }

  static fromMinor(minorUnits: number, currency: Currency): Money {
    if (!Number.isInteger(minorUnits)) {
      throw new DomainError("MONEY_INVALID", `Minor units must be integer: ${minorUnits}`);
    }
    return new Money(minorUnits, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  get amountMajor(): number {
    return this.minorUnits / 100;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainError(
        "MONEY_CURRENCY_MISMATCH",
        `Cannot combine ${this.currency} with ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits >= other.minorUnits;
  }

  toString(): string {
    return `${this.amountMajor.toFixed(2)} ${this.currency}`;
  }
}
