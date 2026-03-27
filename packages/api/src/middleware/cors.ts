import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return origin;
    const allowed = [
      "http://localhost:5173",
      "http://localhost:4173",
    ];
    if (allowed.includes(origin)) return origin;
    if (/\.pages\.dev$/.test(origin)) return origin;
    if (/internetmindmap\.com$/.test(origin)) return origin;
    return null;
  },
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});
