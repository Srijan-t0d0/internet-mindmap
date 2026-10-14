import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../bindings";

export function createRateLimiter(binding: "SETTINGS_RATE_LIMITER" | "CHAT_RATE_LIMITER" | "SEARCH_RATE_LIMITER" | "SAVE_RATE_LIMITER" | "IMPORT_RATE_LIMITER") {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const limiter = c.env[binding];
    if (!limiter) return c.json({ error: "Rate limiting unavailable. Please try again later." }, 503, { "Retry-After": "60" });
    let success: boolean;
    try {
      // ponytail: approximate per-location counters; use shared storage for strict global quotas.
      ({ success } = await limiter.limit({ key: c.get("userId") }));
    } catch {
      return c.json({ error: "Rate limiting unavailable. Please try again later." }, 503, { "Retry-After": "60" });
    }
    if (!success) return c.json({ error: "Rate limit exceeded. Please try again later." }, 429, { "Retry-After": "60" });
    return next();
  });
}
