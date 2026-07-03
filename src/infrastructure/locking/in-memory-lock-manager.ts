import { LockManager } from "../../application/ports/lock-manager.js";

/**
 * In-memory keyed async mutex. Per key, calls are serialized by chaining onto a
 * per-key promise "tail"; different keys never block each other. This mirrors
 * the contract of a distributed lock (Redis/DB advisory lock) closely enough to
 * exercise the concurrency-sensitive code paths in tests.
 *
 * Because JS is single-threaded, the danger is interleaving across `await`
 * points, not true parallelism — this manager guarantees a critical section is
 * never re-entered for the same key until the previous holder's promise settles.
 */
export class InMemoryLockManager implements LockManager {
  /** For each key, a promise that resolves when the current holder releases. */
  private readonly tails = new Map<string, Promise<void>>();

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    // Gate that the *next* caller will await; we resolve it on release.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The new tail resolves only after the previous holder released AND we do.
    this.tails.set(
      key,
      previous.then(() => gate),
    );

    // Wait for our turn.
    await previous;
    try {
      return await fn();
    } finally {
      release();
      // Best-effort cleanup: if we are still the tail once settled, drop the key
      // to keep the map from growing unbounded under many distinct keys.
      const currentTail = this.tails.get(key);
      if (currentTail) {
        currentTail.then(() => {
          if (this.tails.get(key) === currentTail) {
            this.tails.delete(key);
          }
        });
      }
    }
  }
}
