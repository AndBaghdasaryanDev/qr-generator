export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory limiter. It protects a single server instance; on multi-instance
 * or serverless deployments each instance keeps its own counters, so put a shared limiter
 * (e.g. at the CDN/WAF) in front for stronger guarantees. Static QR generation never hits
 * the server and is therefore never limited.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this.now();
    if (this.buckets.size > 10_000) this.sweep(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    const allowed = bucket.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

/** Best-effort client identifier. Only trust forwarded headers behind a proxy that sets them. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
