/** Port for reading the current time — injected so time is deterministic in tests. */
export interface Clock {
  now(): Date;
}
