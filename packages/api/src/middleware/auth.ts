import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../bindings";

/**
 * Validates session (cookie or Bearer token) via the Better Auth instance
 * already stored on context by the global middleware in index.ts.
 * Also accepts the legacy AGENT_API_TOKEN bearer for backward compat.
 */
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Legacy agent token — keeps existing AI agent integrations working
  const authHeader = c.req.header("Authorization");
  if (
    authHeader?.startsWith("Bearer ") &&
    authHeader.slice(7) === c.env.AGENT_API_TOKEN
  ) {
    c.set("userId", "agent");
    return next();
  }

  // Reuse the auth instance created once per request in index.ts
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", session.user.id);
  return next();
});
