import { JournalEntry } from "./journal-entry.js";

/**
 * Port for the general ledger. Implemented by infrastructure; the domain only
 * depends on this interface.
 */
export interface AccountingLedger {
  /** Post a balanced journal entry to the general ledger. */
  post(entry: JournalEntry): Promise<void>;
}
