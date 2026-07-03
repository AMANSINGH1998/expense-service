import type { ReimbursementId, EmployeeId } from "../../shared/ids.js";
import type { ReimbursementTransaction } from "./reimbursement-transaction.js";

/** Persistence port for reimbursement transactions (implemented in infra). */
export interface ReimbursementRepository {
  save(txn: ReimbursementTransaction): Promise<void>;
  findById(id: ReimbursementId): Promise<ReimbursementTransaction | null>;
  listForEmployee(employeeId: EmployeeId): Promise<ReimbursementTransaction[]>;
}
