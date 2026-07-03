import { EmployeeId, ReimbursementId } from "../../shared/ids.js";
import {
  ReimbursementProps,
  ReimbursementTransaction,
} from "../../domain/reimbursement/reimbursement-transaction.js";
import { ReimbursementRepository } from "../../domain/reimbursement/reimbursement-repository.js";

/** In-memory ReimbursementRepository (snapshot + rehydrate for isolation). */
export class InMemoryReimbursementRepository implements ReimbursementRepository {
  private readonly store = new Map<ReimbursementId, ReimbursementProps>();

  async save(txn: ReimbursementTransaction): Promise<void> {
    this.store.set(txn.id, txn.snapshot());
  }

  async findById(id: ReimbursementId): Promise<ReimbursementTransaction | null> {
    const props = this.store.get(id);
    return props ? ReimbursementTransaction.rehydrate(props) : null;
  }

  async listForEmployee(employeeId: EmployeeId): Promise<ReimbursementTransaction[]> {
    return [...this.store.values()]
      .filter((p) => p.employeeId === employeeId)
      .map((p) => ReimbursementTransaction.rehydrate(p));
  }
}
