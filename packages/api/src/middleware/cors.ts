import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { Env } from "../bindings";

export const corsMiddleware = createMiddleware<{ Bindings: Env }>((c, next) => cors({
  origin: (origin) => {
    const allowed = [c.env.APP_BASE_URL, "http://localhost:3000", "http://localhost:5173", "http://localhost:4173"];
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
  maxAge: 86400,
})(c, next));
