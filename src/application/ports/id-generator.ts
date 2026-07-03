/** Port for generating unique ids — injected so ids are deterministic in tests. */
export interface IdGenerator {
  next(): string;
}
