import { randomUUID } from "node:crypto";
import { IdGenerator } from "../../application/ports/id-generator.js";

/** Production id generator using UUIDv4. */
export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/** Deterministic, monotonic id generator for tests/demo. */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  constructor(private readonly prefix = "id") {}
  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
