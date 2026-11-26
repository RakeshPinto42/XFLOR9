/**
 * A small per-visitor rate limit (sliding window, in memory). It stops one visitor from spending
 * the whole day's search budget; cached searches are cheap but still count, which is fine at
 * these numbers. Memory is bounded: old visitors are forgotten.
 */
export function createRateLimiter({ limit, windowMs, now, maxKeys = 5_000 }: { limit: number; windowMs: number; now: () => number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** True if this request may go ahead (and records it). */
    allow(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.delete(key); // re-insert: Map order is least-recently-used first
      hits.set(key, recent);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return true;
    },
  };
}
