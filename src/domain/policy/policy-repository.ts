import { PolicyId } from "../../shared/ids.js";
import { Policy } from "./policy.js";

/** Port for policy persistence. Implemented in infrastructure. */
export interface PolicyRepository {
  findById(id: PolicyId): Promise<Policy | null>;
  save(policy: Policy): Promise<void>;
}
