import { Context, Next } from "hono";
import type { Env } from "../bindings";

type AllowedRole = "extension" | "agent";

export function auth(...roles: AllowedRole[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = header.slice(7);
    const extToken = c.env.EXTENSION_API_TOKEN;
    const agentToken = c.env.AGENT_API_TOKEN;

    const isExtension = token === extToken;
    const isAgent = token === agentToken;

    if (!isExtension && !isAgent) {
      return c.json({ error: "Invalid token" }, 401);
    }

    if (roles.includes("extension") && isExtension) {
      return next();
    }
    if (roles.includes("agent") && isAgent) {
      return next();
    }

    return c.json({ error: "Insufficient permissions" }, 403);
  };
}
