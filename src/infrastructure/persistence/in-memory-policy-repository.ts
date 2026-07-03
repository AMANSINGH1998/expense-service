import { PolicyId } from "../../shared/ids.js";
import { Policy } from "../../domain/policy/policy.js";
import { PolicyRepository } from "../../domain/policy/policy-repository.js";

/**
 * In-memory PolicyRepository. A Policy is immutable once built, so storing the
 * reference directly is safe.
 */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly store = new Map<PolicyId, Policy>();

  async save(policy: Policy): Promise<void> {
    this.store.set(policy.id, policy);
  }

  async findById(id: PolicyId): Promise<Policy | null> {
    return this.store.get(id) ?? null;
  }
}
