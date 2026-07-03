import { Money, type Currency } from "../../shared/money.js";
import type { BudgetId, DepartmentId, EmployerId } from "../../shared/ids.js";
import { type Result, ok, err, DomainError } from "../../shared/result.js";
import { Period } from "../../shared/period.js";

/**
 * Full property shape of a DepartmentalBudget. Used for rehydration from
 * persistence and as the return shape of `snapshot()`.
 */
export interface DepartmentalBudgetProps {
  id: BudgetId;
  departmentId: DepartmentId;
  employerId: EmployerId;
  period: Period;
  currency: Currency;
  /** Total amount allocated to the department for the period (budget currency). */
  allocated: Money;
  /** Amount already committed/spent against the allocation (budget currency). */
  spent: Money;
}

/** Alias kept for callers that refer to the props by the aggregate's role name. */
export type ExpenseBudgetProps = DepartmentalBudgetProps;

/** Input required to open a fresh budget. `spent` is always derived (zero). */
export interface CreateDepartmentalBudgetInput {
  id: BudgetId;
  departmentId: DepartmentId;
  employerId: EmployerId;
  period: Period;
  currency: Currency;
  allocated: Money;
}

/**
 * DepartmentalBudget — aggregate root guarding how much a department may spend
 * in a given period. It enforces its own currency and never lets `spent`
 * exceed `allocated` (via `deduct`). All money is held in the budget currency.
 */
export class DepartmentalBudget {
  private constructor(private props: DepartmentalBudgetProps) {}

  /**
   * Open a new budget for a department/period. Spending starts at zero.
   * Returns an error for expected business-rule violations (currency /
   * negative allocation); the caller decides how to surface them.
   */
  static create(input: CreateDepartmentalBudgetInput): Result<DepartmentalBudget> {
    const { id, departmentId, employerId, period, currency, allocated } = input;

    // The allocation must be denominated in the budget's own currency.
    if (allocated.currency !== currency) {
      return err(
        new DomainError(
          "BUDGET_CURRENCY_MISMATCH",
          `Allocated currency ${allocated.currency} does not match budget currency ${currency}`,
        ),
      );
    }

    // A budget cannot be opened with a negative allocation.
    if (allocated.isNegative()) {
      return err(
        new DomainError(
          "BUDGET_INVALID_ALLOCATION",
          `Allocated amount ${allocated.toString()} must not be negative`,
        ),
      );
    }

    return ok(
      new DepartmentalBudget({
        id,
        departmentId,
        employerId,
        period,
        currency,
        allocated,
        spent: Money.zero(currency),
      }),
    );
  }

  /** Reconstruct an existing budget from persisted state. No validation. */
  static rehydrate(props: DepartmentalBudgetProps): DepartmentalBudget {
    return new DepartmentalBudget({ ...props });
  }

  get id(): BudgetId {
    return this.props.id;
  }

  get departmentId(): DepartmentId {
    return this.props.departmentId;
  }

  get employerId(): EmployerId {
    return this.props.employerId;
  }

  get period(): Period {
    return this.props.period;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get allocated(): Money {
    return this.props.allocated;
  }

  get spent(): Money {
    return this.props.spent;
  }

  /** Funds still available to spend: allocated minus spent. */
  remaining(): Money {
    return this.props.allocated.subtract(this.props.spent);
  }

  /**
   * Whether `amount` still fits within the remaining budget. A currency
   * mismatch can never fit, so it reports false rather than throwing.
   */
  canAfford(amount: Money): boolean {
    if (amount.currency !== this.props.currency) {
      return false;
    }
    return this.remaining().isGreaterThanOrEqual(amount);
  }

  /**
   * Commit `amount` against the budget. Fails (as an expected business error)
   * on currency mismatch or insufficient remaining funds; on success it
   * mutates `spent` and returns this same aggregate instance.
   */
  deduct(amount: Money): Result<DepartmentalBudget> {
    if (amount.currency !== this.props.currency) {
      return err(
        new DomainError(
          "BUDGET_CURRENCY_MISMATCH",
          `Deduction currency ${amount.currency} does not match budget currency ${this.props.currency}`,
        ),
      );
    }

    if (!this.canAfford(amount)) {
      return err(
        new DomainError(
          "BUDGET_INSUFFICIENT",
          `Cannot deduct ${amount.toString()}; only ${this.remaining().toString()} remaining`,
        ),
      );
    }

    this.props.spent = this.props.spent.add(amount);
    return ok(this);
  }

  /** Immutable copy of the current state, safe to hand to the outside world. */
  snapshot(): Readonly<DepartmentalBudgetProps> {
    return Object.freeze({ ...this.props });
  }
}
