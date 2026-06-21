/**
 * Simple in-memory sliding window rate limiter.
 * For production with multiple instances, replace with @upstash/ratelimit + Redis.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000);

export interface RateLimitConfig {
  maxRequests: number;    // max requests allowed in the window
  windowMs: number;       // window duration in milliseconds
}

export const RATE_LIMITS = {
  catalog: { maxRequests: 60, windowMs: 60_000 },       // 60 req/min
  publicOrders: { maxRequests: 20, windowMs: 60_000 },   // 20 req/min
  catalogSearch: { maxRequests: 30, windowMs: 60_000 },  // 30 req/min
} as const;

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.catalog
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = store.get(identifier);

  // If no entry or window expired, create fresh
  if (!entry || entry.resetAt < now) {
    store.set(identifier, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
  }

  // Within window: increment and check
  entry.count++;

  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, resetIn: entry.resetAt - now };
}
