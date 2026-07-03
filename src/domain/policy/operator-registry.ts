import { DomainError } from "../../shared/result.js";
import { FactValue } from "./fact-context.js";

/** A rule value can be a primitive or a list (for in/notIn). */
export type RuleValue = FactValue | readonly FactValue[];

/** Pure comparison: does `factValue` satisfy the operator against `ruleValue`? */
export type OperatorFn = (factValue: FactValue, ruleValue: RuleValue) => boolean;

const asNumber = (v: FactValue | RuleValue, side: string): number => {
  if (typeof v !== "number") {
    throw new DomainError("OPERATOR_TYPE", `Expected number on ${side}, got ${typeof v}`);
  }
  return v;
};

const asArray = (v: RuleValue): readonly FactValue[] => {
  if (!Array.isArray(v)) {
    throw new DomainError("OPERATOR_TYPE", "Expected an array rule value for in/notIn");
  }
  return v;
};

/**
 * Registry of comparison operators. This is the "static code" half of the
 * dynamic policy engine: config names an operator, the behaviour lives here.
 * Extending the engine = registering one function; open for extension, closed
 * for modification (OCP).
 */
export class OperatorRegistry {
  private readonly operators = new Map<string, OperatorFn>();

  static withDefaults(): OperatorRegistry {
    const r = new OperatorRegistry();
    r.register("eq", (a, b) => a === b);
    r.register("neq", (a, b) => a !== b);
    r.register("gt", (a, b) => asNumber(a, "fact") > asNumber(b, "rule"));
    r.register("gte", (a, b) => asNumber(a, "fact") >= asNumber(b, "rule"));
    r.register("lt", (a, b) => asNumber(a, "fact") < asNumber(b, "rule"));
    r.register("lte", (a, b) => asNumber(a, "fact") <= asNumber(b, "rule"));
    r.register("in", (a, b) => asArray(b).includes(a));
    r.register("notIn", (a, b) => !asArray(b).includes(a));
    return r;
  }

  register(name: string, fn: OperatorFn): this {
    this.operators.set(name, fn);
    return this;
  }

  has(name: string): boolean {
    return this.operators.has(name);
  }

  get(name: string): OperatorFn {
    const fn = this.operators.get(name);
    if (!fn) {
      throw new DomainError("OPERATOR_UNKNOWN", `Unknown operator: ${name}`);
    }
    return fn;
  }

  names(): string[] {
    return [...this.operators.keys()];
  }
}
