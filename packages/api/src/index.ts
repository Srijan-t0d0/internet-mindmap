import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Env, Variables } from "./bindings";
import { corsMiddleware } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rate-limit";
import { createAuth } from "./lib/auth";
import saveRoute from "./routes/save";
import searchRoute from "./routes/search";
import itemsRoute from "./routes/items";
import chatRoute from "./routes/chat";
import tagsRoute from "./routes/tags";
import agentRoute from "./routes/agent";
import importRoute from "./routes/import";
import usageRoute from "./routes/usage";

export { ProcessItemWorkflow } from "./workflows/process-item";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use(logger());
app.use("*", corsMiddleware);

// Create one Better Auth instance per request and store it on context.
// This avoids re-instantiating (and re-connecting to D1) on every middleware
// call — D1 bindings are per-request, so we can't use a module-level singleton.
app.use("*", async (c, next) => {
  c.set("auth", createAuth(c.env));
  await next();
});

// Extension OAuth callback — Better Auth completes Google OAuth and sets a
// session cookie, then redirects here. We read the token and bounce to the
// web app's /extension-auth page with the token in the URL hash (hash is
// never sent to the server or stored in browser history).
// A content script on that page picks it up and stores it in extension storage.
app.get("/api/auth/extension/callback", async (c) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });

  const dest = new URL(`${c.env.APP_BASE_URL}/extension-auth`);
  dest.hash = session ? `token=${session.session.token}` : "error=auth_failed";
  return c.redirect(dest.toString());
});

// Better Auth — handles /api/auth/sign-in/social, /api/auth/callback/google,
// /api/auth/get-session, /api/auth/sign-out, etc.
// Note: /api/auth/extension/callback above must stay before this wildcard.
// Hono uses `/*` (not `/**`) to match all sub-paths.
app.on(["GET", "POST", "DELETE"], "/api/auth/*", (c) => {
  return c.get("auth").handler(c.req.raw);
});

// Auth for all API routes (except /api/auth/*)
app.use("/api/save/*", requireAuth);
app.use("/api/search/*", requireAuth);
app.use("/api/items/*", requireAuth);
app.use("/api/chat/*", requireAuth);
app.use("/api/tags/*", requireAuth);
app.use("/api/agent/*", requireAuth);
app.use("/api/import/*", requireAuth);
app.use("/api/usage/*", requireAuth);

// Rate limiters (after auth, so userId is available)
app.use("/api/chat/*", createRateLimiter(20, "1 m", "chat"));
app.use("/api/search/*", createRateLimiter(30, "1 m", "search"));
app.use("/api/save/*", createRateLimiter(10, "1 m", "save"));
app.use("/api/import/*", createRateLimiter(5, "1 h", "import"));

// Routes
app.route("/api/save", saveRoute);
app.route("/api/search", searchRoute);
app.route("/api/items", itemsRoute);
app.route("/api/chat", chatRoute);
app.route("/api/tags", tagsRoute);
app.route("/api/agent", agentRoute);
app.route("/api/import", importRoute);
app.route("/api/usage", usageRoute);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "internet-mindmap-api" }));

export default app;
