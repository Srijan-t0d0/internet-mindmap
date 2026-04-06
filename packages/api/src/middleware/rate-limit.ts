import { createMiddleware } from "hono/factory";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";
import type { Env, Variables } from "../bindings";

/**
 * Factory: creates a per-user rate limiter for a specific endpoint.
 * Gracefully skips if Upstash env vars are not set (local dev).
 */
export function createRateLimiter(
  requests: number,
  window: string,
  prefix: string
) {
  return createMiddleware<{
    Bindings: Env;
    Variables: Variables;
  }>(async (c, next) => {
    // Skip rate limiting if Upstash is not configured (local dev)
    if (!c.env.UPSTASH_REDIS_REST_URL || !c.env.UPSTASH_REDIS_REST_TOKEN) {
      return next();
    }

    const redis = new Redis({
      url: c.env.UPSTASH_REDIS_REST_URL,
      token: c.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      prefix: `ratelimit:${prefix}`,
    });

    const userId = c.get("userId");
    const { success, limit, remaining, reset, pending } = await ratelimit.limit(
      `${prefix}:${userId}`
    );

    // Flush analytics without blocking the response
    c.executionCtx.waitUntil(pending);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", reset.toString());

    if (!success) {
      return c.json(
        { error: "Rate limit exceeded. Please try again later." },
        429
      );
    }

    return next();
  });
}
