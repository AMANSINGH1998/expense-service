import { Money } from "../../shared/money.js";
import { Period } from "../../shared/period.js";
import {
  DepartmentId,
  EmployeeId,
  EmployerId,
  ExpenseId,
  PolicyId,
} from "../../shared/ids.js";
import { DomainError, Result, err, ok } from "../../shared/result.js";
import { ExpenseStatus, canTransition, isTerminal } from "./expense-status.js";

/** Expense category. Categories are stable business concepts, kept in code. */
export type ExpenseCategory = "MEALS" | "TRAVEL" | "LODGING" | "SOFTWARE" | "OTHER";

export interface ExpenseProps {
  readonly id: ExpenseId;
  readonly employeeId: EmployeeId;
  readonly employerId: EmployerId;
  readonly departmentId: DepartmentId;
  readonly policyId: PolicyId;
  readonly category: ExpenseCategory;
  /** Amount as entered by the employee, in their own currency. */
  readonly amount: Money;
  readonly description: string;
  readonly period: Period;
  readonly submittedAt: Date;
  status: ExpenseStatus;
  /** Human-readable reason for the last status transition. */
  decisionReason: string | null;
  /** Name of the policy rule that decided the outcome, if any. */
  decidedByRule: string | null;
}

/**
 * Expense aggregate root. Owns its status transitions; callers cannot mutate
 * status directly — they must go through the transition method, which enforces
 * the state machine.
 */
export class Expense {
  private constructor(private readonly props: ExpenseProps) {}

  static submit(input: {
    id: ExpenseId;
    employeeId: EmployeeId;
    employerId: EmployerId;
    departmentId: DepartmentId;
    policyId: PolicyId;
    category: ExpenseCategory;
    amount: Money;
    description: string;
    submittedAt: Date;
  }): Expense {
    if (input.amount.isNegative() || input.amount.minorUnits === 0) {
      throw new DomainError("EXPENSE_AMOUNT_INVALID", "Expense amount must be positive");
    }
    return new Expense({
      ...input,
      period: Period.fromDate(input.submittedAt),
      status: ExpenseStatus.SUBMITTED,
      decisionReason: null,
      decidedByRule: null,
    });
  }

  /** Rehydrate from persistence. */
  static rehydrate(props: ExpenseProps): Expense {
    return new Expense({ ...props });
  }

  get id(): ExpenseId {
    return this.props.id;
  }
  get employeeId(): EmployeeId {
    return this.props.employeeId;
  }
  get employerId(): EmployerId {
    return this.props.employerId;
  }
  get departmentId(): DepartmentId {
    return this.props.departmentId;
  }
  get policyId(): PolicyId {
    return this.props.policyId;
  }
  get category(): ExpenseCategory {
    return this.props.category;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get period(): Period {
    return this.props.period;
  }
  get status(): ExpenseStatus {
    return this.props.status;
  }
  get decisionReason(): string | null {
    return this.props.decisionReason;
  }
  get decidedByRule(): string | null {
    return this.props.decidedByRule;
  }

  private transition(
    to: ExpenseStatus,
    reason: string,
    ruleName: string | null,
  ): Result<Expense> {
    if (isTerminal(this.props.status)) {
      return err(
        new DomainError(
          "EXPENSE_TERMINAL",
          `Expense ${this.props.id} is already ${this.props.status} and cannot change`,
        ),
      );
    }
    if (!canTransition(this.props.status, to)) {
      return err(
        new DomainError(
          "EXPENSE_INVALID_TRANSITION",
          `Cannot move expense from ${this.props.status} to ${to}`,
        ),
      );
    }
    this.props.status = to;
    this.props.decisionReason = reason;
    this.props.decidedByRule = ruleName;
    return ok(this);
  }

  approve(reason: string, ruleName: string | null): Result<Expense> {
    return this.transition(ExpenseStatus.APPROVED, reason, ruleName);
  }
  markPending(reason: string, ruleName: string | null): Result<Expense> {
    return this.transition(ExpenseStatus.PENDING, reason, ruleName);
  }
  markNonApproved(reason: string, ruleName: string | null): Result<Expense> {
    return this.transition(ExpenseStatus.NON_APPROVED, reason, ruleName);
  }
  reject(reason: string, ruleName: string | null): Result<Expense> {
    return this.transition(ExpenseStatus.REJECTED, reason, ruleName);
  }

  /** Snapshot for persistence / read models. Returns a copy. */
  snapshot(): Readonly<ExpenseProps> {
    return { ...this.props };
  }
}
