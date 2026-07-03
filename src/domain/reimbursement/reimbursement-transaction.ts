import { Money } from "../../shared/money.js";
import type {
  ReimbursementId,
  ExpenseId,
  EmployeeId,
  EmployerId,
} from "../../shared/ids.js";
import { DomainError } from "../../shared/result.js";

/** Lifecycle of a reimbursement owed to an employee. */
export enum ReimbursementStatus {
  RECORDED = "RECORDED",
  SETTLED = "SETTLED",
}

/** Full state of a ReimbursementTransaction, used for creation & rehydration. */
export interface ReimbursementProps {
  readonly id: ReimbursementId;
  readonly expenseId: ExpenseId;
  readonly employeeId: EmployeeId;
  readonly employerId: EmployerId;
  /** Amount owed, in the budget/employer currency. */
  readonly amount: Money;
  /** Mutable within the aggregate; transitions RECORDED -> SETTLED. */
  status: ReimbursementStatus;
  readonly createdAt: Date;
}

/** Arguments to record a fresh reimbursement (status is derived, not passed). */
export type RecordReimbursementArgs = Omit<ReimbursementProps, "status">;

/**
 * Records that an approved expense's amount is reimbursable/owed to the
 * employee, expressed in the budget/employer currency. Starts RECORDED and
 * transitions once to SETTLED when paid out.
 */
export class ReimbursementTransaction {
  private constructor(private props: ReimbursementProps) {}

  /** Create a new reimbursement in the RECORDED state. */
  static record(args: RecordReimbursementArgs): ReimbursementTransaction {
    // A reimbursement must owe a strictly positive amount.
    if (args.amount.isNegative() || args.amount.minorUnits === 0) {
      throw new DomainError(
        "REIMBURSEMENT_AMOUNT_INVALID",
        `Reimbursement amount must be positive, got ${args.amount.toString()}`,
      );
    }
    return new ReimbursementTransaction({
      ...args,
      status: ReimbursementStatus.RECORDED,
    });
  }

  /** Reconstruct from persisted state without re-running invariants. */
  static rehydrate(props: ReimbursementProps): ReimbursementTransaction {
    return new ReimbursementTransaction({ ...props });
  }

  get id(): ReimbursementId {
    return this.props.id;
  }

  get expenseId(): ExpenseId {
    return this.props.expenseId;
  }

  get employeeId(): EmployeeId {
    return this.props.employeeId;
  }

  get employerId(): EmployerId {
    return this.props.employerId;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get status(): ReimbursementStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  /** Transition RECORDED -> SETTLED. Programmer error if not RECORDED. */
  markSettled(): void {
    if (this.props.status !== ReimbursementStatus.RECORDED) {
      throw new DomainError(
        "REIMBURSEMENT_NOT_SETTLEABLE",
        `Cannot settle reimbursement in status ${this.props.status}`,
      );
    }
    this.props.status = ReimbursementStatus.SETTLED;
  }

  /** Defensive copy of the current state. */
  snapshot(): ReimbursementProps {
    return {
      ...this.props,
      createdAt: new Date(this.props.createdAt.getTime()),
    };
  }
}
