/** A primitive fact value that a rule condition can be compared against. */
export type FactValue = number | string | boolean;

/**
 * The evaluation context: a flat map of field name -> fact value, assembled by
 * the application layer from expense/budget/ledger data. The policy domain
 * stays ignorant of where the facts come from.
 */
export type FactContext = Readonly<Record<string, FactValue>>;
