import { Money, Currency } from "../../shared/money.js";
import { DomainError } from "../../shared/result.js";
import { FxRateProvider } from "../../application/ports/fx-rate-provider.js";

/**
 * Mock FX provider backed by a static rate table. A rate of `r` for `FROM->TO`
 * means 1 unit of FROM = r units of TO. Same-currency conversions are identity.
 * A missing rate is a configuration error and throws.
 */
export class MockFxRateProvider implements FxRateProvider {
  private readonly rates = new Map<string, number>();

  private static key(from: Currency, to: Currency): string {
    return `${from}->${to}`;
  }

  static withRates(rates: Record<string, number>): MockFxRateProvider {
    const p = new MockFxRateProvider();
    for (const [k, v] of Object.entries(rates)) {
      p.rates.set(k, v);
    }
    return p;
  }

  setRate(from: Currency, to: Currency, rate: number): this {
    this.rates.set(MockFxRateProvider.key(from, to), rate);
    return this;
  }

  convert(amount: Money, target: Currency): Money {
    if (amount.currency === target) {
      return amount;
    }
    const rate = this.rates.get(MockFxRateProvider.key(amount.currency, target));
    if (rate === undefined) {
      throw new DomainError(
        "FX_RATE_MISSING",
        `No FX rate configured for ${amount.currency}->${target}`,
      );
    }
    return Money.of(amount.amountMajor * rate, target);
  }
}
