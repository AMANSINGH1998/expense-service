import { RuleAction } from "./rule-action.js";

/**
 * The outcome of evaluating a policy against a fact context. Pure data — the
 * application layer maps `action` onto an expense state transition.
 */
export interface PolicyDecision {
  readonly action: RuleAction;
  /** The rule that decided this, or null when no rule matched. */
  readonly matchedRuleName: string | null;
  readonly reason: string;
}
