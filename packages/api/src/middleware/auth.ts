import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../bindings";

/**
 * Validates session (cookie or Bearer token) via the Better Auth instance
 * already stored on context by the global middleware in index.ts.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Reuse the auth instance created once per request in index.ts
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", session.user.id);
  return next();
});
