import type { MiddlewareHandler } from "hono";

type Bucket = { count: number; windowStart: number };

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Fixed-window per-key counter. `now` is injected for deterministic tests.
 * In-memory and per-process by design (the security-critical limiter is Better
 * Auth's DB-backed one); this is only a coarse global safety net.
 */
export function createRateLimiter(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  return function check(key: string, now: number): { limited: boolean; retryAfter: number } {
    const b = buckets.get(key);
    if (!b || now - b.windowStart >= opts.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) {
          if (now - v.windowStart >= opts.windowMs) buckets.delete(k);
        }
      }
      return { limited: false, retryAfter: 0 };
    }
    b.count += 1;
    if (b.count > opts.max) {
      return {
        limited: true,
        retryAfter: Math.ceil((opts.windowMs - (now - b.windowStart)) / 1000),
      };
    }
    return { limited: false, retryAfter: 0 };
  };
}

function clientIp(headers: Headers): string {
  return (
    headers.get("fly-client-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Lenient global net. Skips /health (liveness) and /api/auth/* (Better Auth's own limiter). */
export function globalRateLimit(
  opts: RateLimitOptions = { windowMs: 60_000, max: 300 },
): MiddlewareHandler {
  const check = createRateLimiter(opts);
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/health" || path.startsWith("/api/auth/")) return next();
    const { limited, retryAfter } = check(clientIp(c.req.raw.headers), Date.now());
    if (limited) {
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited", retryAfter } as const, 429);
    }
    return next();
  };
}
