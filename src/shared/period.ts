/**
 * A billing period. For this prototype we work at month granularity, which is
 * what the "monthly expenses" requirement calls for.
 */
export class Period {
  private constructor(
    readonly year: number,
    /** 1-12 */
    readonly month: number,
  ) {}

  static of(year: number, month: number): Period {
    return new Period(year, month);
  }

  static fromDate(date: Date): Period {
    return new Period(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  get key(): string {
    return `${this.year}-${String(this.month).padStart(2, "0")}`;
  }

  equals(other: Period): boolean {
    return this.year === other.year && this.month === other.month;
  }
}
