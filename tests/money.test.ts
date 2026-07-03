import { describe, it, expect } from "vitest";
import { Money } from "../src/shared/money.js";
import { DomainError } from "../src/shared/result.js";

describe("Money", () => {
  describe("construction and rounding", () => {
    it("stores major amounts as minor units", () => {
      const m = Money.of(10, "USD");
      expect(m.minorUnits).toBe(1000);
      expect(m.amountMajor).toBe(10);
      expect(m.currency).toBe("USD");
    });

    it("rounds to nearest minor unit via Math.round(x*100)", () => {
      expect(Money.of(10.005, "USD").minorUnits).toBe(1001);
      expect(Money.of(10.004, "USD").minorUnits).toBe(1000);
    });

    it("fromMinor builds directly from integer minor units", () => {
      const m = Money.fromMinor(2500, "EUR");
      expect(m.minorUnits).toBe(2500);
      expect(m.amountMajor).toBe(25);
    });

    it("fromMinor rejects non-integer minor units", () => {
      expect(() => Money.fromMinor(10.5, "USD")).toThrow(DomainError);
    });

    it("of rejects non-finite amounts", () => {
      expect(() => Money.of(Number.NaN, "USD")).toThrow(DomainError);
    });

    it("zero produces a zero-valued amount", () => {
      const z = Money.zero("USD");
      expect(z.minorUnits).toBe(0);
      expect(z.currency).toBe("USD");
    });
  });

  describe("add", () => {
    it("adds two same-currency amounts", () => {
      const sum = Money.of(10, "USD").add(Money.of(5.5, "USD"));
      expect(sum.minorUnits).toBe(1550);
    });

    it("throws MONEY_CURRENCY_MISMATCH across currencies", () => {
      let caught: unknown;
      try {
        Money.of(10, "USD").add(Money.of(5, "EUR"));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe("MONEY_CURRENCY_MISMATCH");
    });
  });

  describe("subtract", () => {
    it("subtracts two same-currency amounts", () => {
      const diff = Money.of(10, "USD").subtract(Money.of(3, "USD"));
      expect(diff.minorUnits).toBe(700);
    });

    it("can produce negative amounts", () => {
      const diff = Money.of(3, "USD").subtract(Money.of(10, "USD"));
      expect(diff.isNegative()).toBe(true);
    });

    it("throws MONEY_CURRENCY_MISMATCH across currencies", () => {
      let caught: unknown;
      try {
        Money.of(10, "USD").subtract(Money.of(5, "GBP"));
      } catch (e) {
        caught = e;
      }
      expect((caught as DomainError).code).toBe("MONEY_CURRENCY_MISMATCH");
    });
  });

  describe("comparisons", () => {
    it("isNegative reflects the sign", () => {
      expect(Money.fromMinor(-1, "USD").isNegative()).toBe(true);
      expect(Money.zero("USD").isNegative()).toBe(false);
      expect(Money.of(1, "USD").isNegative()).toBe(false);
    });

    it("isGreaterThan is strict", () => {
      expect(Money.of(10, "USD").isGreaterThan(Money.of(5, "USD"))).toBe(true);
      expect(Money.of(5, "USD").isGreaterThan(Money.of(5, "USD"))).toBe(false);
      expect(Money.of(5, "USD").isGreaterThan(Money.of(10, "USD"))).toBe(false);
    });

    it("isGreaterThanOrEqual includes equality", () => {
      expect(Money.of(5, "USD").isGreaterThanOrEqual(Money.of(5, "USD"))).toBe(true);
      expect(Money.of(10, "USD").isGreaterThanOrEqual(Money.of(5, "USD"))).toBe(true);
      expect(Money.of(4, "USD").isGreaterThanOrEqual(Money.of(5, "USD"))).toBe(false);
    });

    it("comparisons throw across currencies", () => {
      expect(() => Money.of(10, "USD").isGreaterThan(Money.of(5, "EUR"))).toThrow(
        DomainError,
      );
    });
  });

  describe("toString", () => {
    it("formats as fixed 2-decimal major amount plus currency", () => {
      expect(Money.of(10, "USD").toString()).toBe("10.00 USD");
      expect(Money.fromMinor(1234, "EUR").toString()).toBe("12.34 EUR");
    });
  });
});
