/**
 * Port for a mutual-exclusion lock keyed by an arbitrary string. In production
 * this would be backed by a distributed lock (Redis Redlock, DB advisory lock,
 * etc.); in this prototype it is an in-memory keyed async mutex.
 *
 * The critical section must be kept minimal — callers do the expensive work
 * (e.g. policy evaluation) OUTSIDE the lock and only mutate shared state inside.
 */
export interface LockManager {
  /**
   * Acquire the lock for `key`, run `fn`, and release — even if `fn` throws.
   * Calls for the same key are serialized; calls for different keys run
   * concurrently.
   */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}
