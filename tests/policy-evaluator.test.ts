import { describe, it, expect } from "vitest";
import { Policy, PolicyConfig } from "../src/domain/policy/policy.js";
import { PolicyEvaluator } from "../src/domain/policy/policy-evaluator.js";
import { OperatorRegistry } from "../src/domain/policy/operator-registry.js";
import { FieldCatalog } from "../src/domain/policy/field-catalog.js";
import { RuleAction } from "../src/domain/policy/rule-action.js";

const operators = OperatorRegistry.withDefaults();
const fields = new FieldCatalog()
  .register("amount", "number")
  .register("category", "string");

const buildPolicy = (config: PolicyConfig): Policy =>
  Policy.fromConfig(config, operators, fields);

const evaluator = new PolicyEvaluator(operators);

describe("PolicyEvaluator", () => {
  it("first match by priority wins (lower priority number chosen)", () => {
    const policy = buildPolicy({
      id: "p1",
      name: "p",
      version: 1,
      rules: [
        {
          name: "high-priority-number",
          priority: 10,
          conditions: [{ field: "amount", operator: "gt", value: 0 }],
          action: "MANUAL_REVIEW",
        },
        {
          name: "low-priority-number",
          priority: 1,
          conditions: [{ field: "amount", operator: "gt", value: 0 }],
          action: "AUTO_APPROVE",
        },
      ],
    });

    const decision = evaluator.evaluate(policy, { amount: 30, category: "MEALS" });
    expect(decision.action).toBe(RuleAction.AUTO_APPROVE);
    expect(decision.matchedRuleName).toBe("low-priority-number");
  });

  it("AND logic requires all conditions to match", () => {
    const policy = buildPolicy({
      id: "p2",
      name: "p",
      version: 1,
      rules: [
        {
          name: "and-rule",
          priority: 1,
          conditionLogic: "AND",
          conditions: [
            { field: "amount", operator: "lt", value: 50 },
            { field: "category", operator: "eq", value: "MEALS" },
          ],
          action: "AUTO_APPROVE",
        },
      ],
    });

    expect(
      evaluator.evaluate(policy, { amount: 30, category: "MEALS" }).action,
    ).toBe(RuleAction.AUTO_APPROVE);
    // Second condition fails -> whole AND fails -> no match.
    expect(
      evaluator.evaluate(policy, { amount: 30, category: "TRAVEL" }).matchedRuleName,
    ).toBeNull();
  });

  it("OR logic requires any condition to match", () => {
    const policy = buildPolicy({
      id: "p3",
      name: "p",
      version: 1,
      rules: [
        {
          name: "or-rule",
          priority: 1,
          conditionLogic: "OR",
          conditions: [
            { field: "amount", operator: "gt", value: 1000 },
            { field: "category", operator: "eq", value: "MEALS" },
          ],
          action: "MANUAL_REVIEW",
        },
      ],
    });

    // First condition fails but second matches.
    expect(
      evaluator.evaluate(policy, { amount: 30, category: "MEALS" }).action,
    ).toBe(RuleAction.MANUAL_REVIEW);
    // Neither matches.
    expect(
      evaluator.evaluate(policy, { amount: 30, category: "TRAVEL" }).matchedRuleName,
    ).toBeNull();
  });

  it("returns NOT_APPLICABLE with null matched rule when nothing matches", () => {
    const policy = buildPolicy({
      id: "p4",
      name: "p",
      version: 1,
      rules: [
        {
          name: "never",
          priority: 1,
          conditions: [{ field: "amount", operator: "gt", value: 9999 }],
          action: "REJECT",
        },
      ],
    });

    const decision = evaluator.evaluate(policy, { amount: 30, category: "MEALS" });
    expect(decision.action).toBe(RuleAction.NOT_APPLICABLE);
    expect(decision.matchedRuleName).toBeNull();
  });

  it("a rule referencing an absent fact simply does not match (no throw)", () => {
    const policy = buildPolicy({
      id: "p5",
      name: "p",
      version: 1,
      rules: [
        {
          name: "needs-amount",
          priority: 1,
          conditions: [{ field: "amount", operator: "gt", value: 0 }],
          action: "AUTO_APPROVE",
        },
      ],
    });

    let decision;
    expect(() => {
      // facts has no `amount` field.
      decision = evaluator.evaluate(policy, { category: "MEALS" });
    }).not.toThrow();
    expect(decision!.action).toBe(RuleAction.NOT_APPLICABLE);
    expect(decision!.matchedRuleName).toBeNull();
  });
});
