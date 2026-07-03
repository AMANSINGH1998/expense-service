/**
 * The action a matched rule yields. The application layer maps each to an
 * expense state transition.
 */
export enum RuleAction {
  AUTO_APPROVE = "AUTO_APPROVE",
  MANUAL_REVIEW = "MANUAL_REVIEW",
  REJECT = "REJECT",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

export const isRuleAction = (v: unknown): v is RuleAction =>
  typeof v === "string" && (Object.values(RuleAction) as string[]).includes(v);
