import { Result, err, ok, DomainError } from "../../shared/result.js";
import { Policy, PolicyConfig } from "../../domain/policy/policy.js";
import { PolicyRepository } from "../../domain/policy/policy-repository.js";
import { OperatorRegistry } from "../../domain/policy/operator-registry.js";
import { FieldCatalog } from "../../domain/policy/field-catalog.js";

/**
 * Admin use case: accept an admin-authored policy config, validate it against
 * the code-registered operators and fields, and persist it. Validation failures
 * (unknown operator/field, bad action, duplicate rule) are returned as errors
 * so a bad config is rejected here — never silently at evaluation time.
 *
 * This is where "config dictates behaviour, implementation lives in code" is
 * enforced: the config can only reference operators/fields that exist in code.
 */
export class ConfigurePolicyUseCase {
  constructor(
    private readonly policies: PolicyRepository,
    private readonly operators: OperatorRegistry,
    private readonly fields: FieldCatalog,
  ) {}

  async execute(config: PolicyConfig): Promise<Result<{ policyId: string }>> {
    let policy: Policy;
    try {
      policy = Policy.fromConfig(config, this.operators, this.fields);
    } catch (e) {
      if (e instanceof DomainError) {
        return err(e);
      }
      throw e;
    }
    await this.policies.save(policy);
    return ok({ policyId: policy.id });
  }
}
