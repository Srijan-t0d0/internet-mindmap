import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { evlog } from "evlog/hono";
import "./lib/logging";
import type { Env, Variables } from "./bindings";
import { corsMiddleware } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rate-limit";
import { createAuth } from "./lib/auth";
import saveRoute from "./routes/save";
import searchRoute from "./routes/search";
import itemsRoute from "./routes/items";
import chatRoute from "./routes/chat";
import threadsRoute from "./routes/threads";
import tagsRoute from "./routes/tags";
import mcpRoute from "./routes/mcp";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { mcpUrls } from "./lib/mcp-auth";
import importRoute from "./routes/import";
import usageRoute from "./routes/usage";
import adminRoute from "./routes/admin";
import settingsRoute from "./routes/settings";

export { ProcessItemWorkflow } from "./workflows/process-item";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use("*", evlog());
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.get("log").set({ event: "http.request", requestId });
  c.header("X-Request-Id", requestId);
  await next();
  c.get("log").set({ route: c.req.routePath });
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  return c.json({ error: "Internal server error", requestId: c.get("requestId") }, 500);
});
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

// RFC 8414 path insertion for the /api/auth issuer; PRM identifies the exact resource.
app.get("/.well-known/oauth-authorization-server/api/auth", (c) => oauthProviderAuthServerMetadata(c.get("auth"))(c.req.raw));
app.get("/.well-known/openid-configuration/api/auth", (c) => oauthProviderOpenIdConfigMetadata(c.get("auth"))(c.req.raw));
app.get("/.well-known/oauth-protected-resource/api/mcp", (c) => {
  const { resource, issuer } = mcpUrls(c.env);
  return c.json({ resource, authorization_servers: [issuer], scopes_supported: ["kb:read", "kb:write"],
    bearer_methods_supported: ["header"], resource_name: "Internet Mindmap" });
});
// MCP deliberately bypasses session/bearer auth used by the extension.
app.route("/api/mcp", mcpRoute);

// Auth for all API routes (except /api/auth/*)
app.use("/api/save/*", requireAuth);
app.use("/api/search/*", requireAuth);
app.use("/api/items/*", requireAuth);
app.use("/api/chat/*", requireAuth);
app.use("/api/threads/*", requireAuth);
app.use("/api/tags/*", requireAuth);
app.use("/api/import/*", requireAuth);
app.use("/api/usage/*", requireAuth);
app.use("/api/settings/*", requireAuth);
app.use("/api/settings/*", createRateLimiter("SETTINGS_RATE_LIMITER"));

// Rate limiters (after auth, so userId is available)
app.use("/api/chat/*", createRateLimiter("CHAT_RATE_LIMITER"));
app.use("/api/search/*", createRateLimiter("SEARCH_RATE_LIMITER"));
app.use("/api/save/*", createRateLimiter("SAVE_RATE_LIMITER"));
app.use("/api/import/*", createRateLimiter("IMPORT_RATE_LIMITER"));

// Routes — chained for Hono RPC type inference
const routes = app
  .route("/api/save", saveRoute)
  .route("/api/search", searchRoute)
  .route("/api/items", itemsRoute)
  .route("/api/chat", chatRoute)
  .route("/api/threads", threadsRoute)
  .route("/api/tags", tagsRoute)
  .route("/api/import", importRoute)
  .route("/api/usage", usageRoute)
  .route("/api/settings", settingsRoute)
  .route("/api/admin", adminRoute)
  .get("/", (c) => c.json({ status: "ok", service: "internet-mindmap-api" }, 200));

export type AppType = typeof routes;
export default routes;
