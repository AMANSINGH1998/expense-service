import { PolicyId, asPolicyId } from "../../shared/ids.js";
import { DomainError } from "../../shared/result.js";
import { FieldCatalog } from "./field-catalog.js";
import { OperatorRegistry } from "./operator-registry.js";
import { Rule, RuleConfig } from "./rule.js";

/** Config shape authored by an admin for a whole policy. */
export interface PolicyConfig {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly rules: readonly RuleConfig[];
  /**
   * Fallback action label when NO rule matches. Defaults to NOT_APPLICABLE.
   * Must be a valid RuleAction (validated via a synthetic catch-all rule).
   */
  readonly defaultAction?: string;
}

/**
 * Policy aggregate: an ordered, validated set of rules. Behaviour is "as static
 * as possible" — the shape and evaluation live in code; config only selects and
 * parameterizes rules. Rules are sorted by ascending `priority` (lower number =
 * evaluated first); first match wins.
 */
export class Policy {
  private constructor(
    readonly id: PolicyId,
    readonly name: string,
    readonly version: number,
    /** Sorted by priority ascending. */
    readonly rules: readonly Rule[],
  ) {}

  static fromConfig(
    config: PolicyConfig,
    operators: OperatorRegistry,
    fields: FieldCatalog,
  ): Policy {
    if (!config.id) {
      throw new DomainError("POLICY_INVALID", "Policy id is required");
    }
    const names = new Set<string>();
    for (const r of config.rules) {
      if (names.has(r.name)) {
        throw new DomainError("POLICY_INVALID", `Duplicate rule name "${r.name}"`);
      }
      names.add(r.name);
    }
    const rules = config.rules
      .map((r) => Rule.fromConfig(r, operators, fields))
      .sort((a, b) => a.priority - b.priority);

    return new Policy(asPolicyId(config.id), config.name, config.version, rules);
  }
}
