import { DomainError } from "../../shared/result.js";
import { FactContext, FactValue } from "./fact-context.js";
import { FieldCatalog } from "./field-catalog.js";
import { OperatorRegistry, RuleValue } from "./operator-registry.js";
import { RuleAction, isRuleAction } from "./rule-action.js";

/** How multiple conditions in a rule combine. */
export type ConditionLogic = "AND" | "OR";

/** One condition: does `field` satisfy `operator` against `value`? */
export interface RuleCondition {
  readonly field: string;
  readonly operator: string;
  readonly value: RuleValue;
}

/** The wire/config shape of a rule, as authored by an admin. */
export interface RuleConfig {
  readonly name: string;
  readonly priority: number;
  readonly conditionLogic?: ConditionLogic;
  readonly conditions: readonly RuleCondition[];
  readonly action: string;
}

/**
 * A single policy rule. Immutable. Construction is validated against the
 * operator registry and field catalog so an invalid rule is rejected at
 * configure time, not silently ignored at evaluation time.
 */
export class Rule {
  private constructor(
    readonly name: string,
    readonly priority: number,
    readonly conditionLogic: ConditionLogic,
    readonly conditions: readonly RuleCondition[],
    readonly action: RuleAction,
  ) {}

  static fromConfig(
    config: RuleConfig,
    operators: OperatorRegistry,
    fields: FieldCatalog,
  ): Rule {
    if (!config.name || config.name.trim() === "") {
      throw new DomainError("RULE_INVALID", "Rule name is required");
    }
    if (!isRuleAction(config.action)) {
      throw new DomainError(
        "RULE_INVALID",
        `Rule "${config.name}" has unknown action "${config.action}"`,
      );
    }
    if (config.conditions.length === 0) {
      throw new DomainError("RULE_INVALID", `Rule "${config.name}" has no conditions`);
    }
    for (const c of config.conditions) {
      if (!operators.has(c.operator)) {
        throw new DomainError(
          "RULE_INVALID",
          `Rule "${config.name}" uses unknown operator "${c.operator}"`,
        );
      }
      if (!fields.has(c.field)) {
        throw new DomainError(
          "RULE_INVALID",
          `Rule "${config.name}" references unknown field "${c.field}"`,
        );
      }
    }
    return new Rule(
      config.name,
      config.priority,
      config.conditionLogic ?? "AND",
      config.conditions.map((c) => ({ ...c })),
      config.action,
    );
  }

  /** Evaluate this rule against a fact context. Pure. */
  matches(facts: FactContext, operators: OperatorRegistry): boolean {
    const evalOne = (c: RuleCondition): boolean => {
      const factValue: FactValue | undefined = facts[c.field];
      if (factValue === undefined) {
        // A referenced fact was not supplied for this evaluation. Treat as
        // non-match rather than throwing — the rule simply does not apply.
        return false;
      }
      return operators.get(c.operator)(factValue, c.value);
    };

    return this.conditionLogic === "AND"
      ? this.conditions.every(evalOne)
      : this.conditions.some(evalOne);
  }
}
