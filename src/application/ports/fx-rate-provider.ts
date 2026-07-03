import { Money, Currency } from "../../shared/money.js";

/**
 * Port for currency conversion. Employees may submit in their own currency while
 * the employer's budget is in another (e.g. INR -> USD). Implemented in
 * infrastructure by a mocked rate table.
 */
export interface FxRateProvider {
  /** Convert `amount` into `target` currency. */
  convert(amount: Money, target: Currency): Money;
}
