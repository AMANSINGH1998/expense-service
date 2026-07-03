import { FactContext } from "./fact-context.js";
import { OperatorRegistry } from "./operator-registry.js";
import { Policy } from "./policy.js";
import { PolicyDecision } from "./policy-decision.js";
import { RuleAction } from "./rule-action.js";

/**
 * Pure policy evaluator. Given a policy and a fact context, returns the decision
 * of the first matching rule (rules are pre-sorted by priority). No I/O, no
 * side effects — this is the deterministic heart of the engine and is trivial
 * to unit test.
 */
export class PolicyEvaluator {
  constructor(private readonly operators: OperatorRegistry) {}

  evaluate(policy: Policy, facts: FactContext): PolicyDecision {
    for (const rule of policy.rules) {
      if (rule.matches(facts, this.operators)) {
        return {
          action: rule.action,
          matchedRuleName: rule.name,
          reason: `Matched rule "${rule.name}" -> ${rule.action}`,
        };
      }
    }
    // No rule applied.
    return {
      action: RuleAction.NOT_APPLICABLE,
      matchedRuleName: null,
      reason: "No policy rule matched this expense",
    };
  }
}
