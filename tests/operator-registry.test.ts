import { describe, it, expect } from "vitest";
import { OperatorRegistry } from "../src/domain/policy/operator-registry.js";
import { DomainError } from "../src/shared/result.js";

describe("OperatorRegistry", () => {
  describe("withDefaults", () => {
    const r = OperatorRegistry.withDefaults();

    it("reports presence of known and unknown operators", () => {
      expect(r.has("eq")).toBe(true);
      expect(r.has("nope")).toBe(false);
    });

    it("evaluates numeric comparison operators", () => {
      expect(r.get("lte")(50, 50)).toBe(true);
      expect(r.get("lt")(50, 50)).toBe(false);
      expect(r.get("gt")(3, 2)).toBe(true);
    });

    it("evaluates membership operators", () => {
      expect(r.get("in")("MEALS", ["MEALS", "TRAVEL"])).toBe(true);
      expect(r.get("notIn")("X", ["MEALS"])).toBe(true);
    });

    it("throws OPERATOR_UNKNOWN for an unregistered operator", () => {
      let caught: unknown;
      try {
        r.get("unknown");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe("OPERATOR_UNKNOWN");
    });

    it("throws OPERATOR_TYPE for numeric operators on non-numbers", () => {
      let caught: unknown;
      try {
        r.get("gt")("x", 2);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe("OPERATOR_TYPE");
    });
  });

  describe("extensibility", () => {
    it("supports registering a custom operator", () => {
      const r = OperatorRegistry.withDefaults();
      r.register("startsWith", (a, b) => String(a).startsWith(String(b)));
      expect(r.has("startsWith")).toBe(true);
      expect(r.get("startsWith")("hello", "he")).toBe(true);
      expect(r.get("startsWith")("hello", "xy")).toBe(false);
    });
  });
});
