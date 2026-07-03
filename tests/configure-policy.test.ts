import { describe, it, expect } from "vitest";
import { ConfigurePolicyUseCase } from "../src/application/usecases/configure-policy.js";
import { InMemoryPolicyRepository } from "../src/infrastructure/persistence/in-memory-policy-repository.js";
import { OperatorRegistry } from "../src/domain/policy/operator-registry.js";
import { buildFieldCatalog } from "../src/application/services/expense-facts.js";
import { asPolicyId } from "../src/shared/ids.js";
import type { PolicyConfig } from "../src/domain/policy/policy.js";

const makeUseCase = () => {
  const policies = new InMemoryPolicyRepository();
  const operators = OperatorRegistry.withDefaults();
  const fields = buildFieldCatalog();
  return {
    policies,
    useCase: new ConfigurePolicyUseCase(policies, operators, fields),
  };
};

const baseRule = {
  name: "under-cap",
  priority: 1,
  conditions: [
    { field: "amountInBudgetCurrency", operator: "lte", value: 100 },
  ],
  action: "AUTO_APPROVE",
};

describe("ConfigurePolicyUseCase", () => {
  it("persists a valid config and can be found by id", async () => {
    const { policies, useCase } = makeUseCase();
    const config: PolicyConfig = {
      id: "policy-valid",
      name: "valid policy",
      version: 1,
      rules: [baseRule],
    };

    const result = await useCase.execute(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.policyId).toBe("policy-valid");
    }

    const found = await policies.findById(asPolicyId("policy-valid"));
    expect(found).not.toBeNull();
    expect(found!.id).toBe("policy-valid");
  });

  it("rejects an unknown operator with RULE_INVALID", async () => {
    const { useCase } = makeUseCase();
    const config: PolicyConfig = {
      id: "policy-bad-op",
      name: "p",
      version: 1,
      rules: [
        {
          name: "r",
          priority: 1,
          conditions: [
            { field: "amountInBudgetCurrency", operator: "definitelyNotAnOperator", value: 1 },
          ],
          action: "AUTO_APPROVE",
        },
      ],
    };

    const result = await useCase.execute(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RULE_INVALID");
    }
  });

  it("rejects an unknown field with RULE_INVALID", async () => {
    const { useCase } = makeUseCase();
    const config: PolicyConfig = {
      id: "policy-bad-field",
      name: "p",
      version: 1,
      rules: [
        {
          name: "r",
          priority: 1,
          conditions: [{ field: "notAField", operator: "eq", value: 1 }],
          action: "AUTO_APPROVE",
        },
      ],
    };

    const result = await useCase.execute(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RULE_INVALID");
    }
  });

  it("rejects an invalid action string with RULE_INVALID", async () => {
    const { useCase } = makeUseCase();
    const config: PolicyConfig = {
      id: "policy-bad-action",
      name: "p",
      version: 1,
      rules: [
        {
          name: "r",
          priority: 1,
          conditions: [{ field: "category", operator: "eq", value: "MEALS" }],
          action: "NOT_A_REAL_ACTION",
        },
      ],
    };

    const result = await useCase.execute(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RULE_INVALID");
    }
  });

  it("rejects a duplicate rule name with POLICY_INVALID", async () => {
    const { useCase } = makeUseCase();
    const config: PolicyConfig = {
      id: "policy-dup",
      name: "p",
      version: 1,
      rules: [
        {
          name: "same",
          priority: 1,
          conditions: [{ field: "category", operator: "eq", value: "MEALS" }],
          action: "AUTO_APPROVE",
        },
        {
          name: "same",
          priority: 2,
          conditions: [{ field: "category", operator: "eq", value: "TRAVEL" }],
          action: "MANUAL_REVIEW",
        },
      ],
    };

    const result = await useCase.execute(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("POLICY_INVALID");
    }
  });
});
