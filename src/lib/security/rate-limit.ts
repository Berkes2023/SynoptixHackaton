/**
 * Fixed-window rate limiter. In-memory, so on serverless it is best-effort
 * per instance; a shared store (e.g. Redis) is required for a hard limit.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; reset: number }>();
  return {
    check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterMs: number } {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        hits.set(key, { count: 1, reset: now + opts.windowMs });
        return { allowed: true, remaining: opts.limit - 1, retryAfterMs: 0 };
      }
      if (entry.count >= opts.limit) return { allowed: false, remaining: 0, retryAfterMs: entry.reset - now };
      entry.count++;
      return { allowed: true, remaining: opts.limit - entry.count, retryAfterMs: 0 };
    },
  };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
