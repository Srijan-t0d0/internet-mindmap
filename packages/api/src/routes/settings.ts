import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { userSettings, userProviderCredentials, verification, type ChatProvider } from "../db/schema";
import { CHAT_PROVIDERS, validateChatModel } from "../ai/llm/user-model";
import { encryptProviderKey } from "../lib/crypto";
import { createPkce, consumePkce } from "../lib/pkce";

function provider(value: string): ChatProvider {
  if (!CHAT_PROVIDERS.includes(value as ChatProvider)) throw new HTTPException(400, { message: "Unknown provider" });
  return value as ChatProvider;
}
async function storeKey(env: Env, userId: string, provider: ChatProvider, key: string) {
  const encrypted = await encryptProviderKey(env, userId, provider, key);
  const values = { ...encrypted, last4: key.slice(-4), status: "ok" as const, updatedAt: new Date() };
  await getDb(env).insert(userProviderCredentials).values({ id: crypto.randomUUID(), userId, provider, ...values })
    .onConflictDoUpdate({ target: [userProviderCredentials.userId, userProviderCredentials.provider], set: values });
  return values.last4;
}
async function validateKey(provider: ChatProvider, key: string) {
  const endpoints = { openai: "https://api.openai.com/v1/models", anthropic: "https://api.anthropic.com/v1/models",
    google: "https://generativelanguage.googleapis.com/v1beta/models", openrouter: "https://openrouter.ai/api/v1/key" };
  const headers: Record<string, string> = provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
    : provider === "google" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
  try {
    const response = await fetch(endpoints[provider], { headers, signal: AbortSignal.timeout(10000) });
    await response.body?.cancel();
    if (!response.ok) throw new HTTPException(400, { message: "Provider rejected the key or is unavailable" });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(400, { message: "Could not validate key. Please try again." });
  }
}
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.onError((error, c) => error instanceof HTTPException
  ? c.json({ error: error.message }, error.status)
  : c.json({ error: "Could not update settings. Please try again." }, 500));
app.use("*", async (c, next) => {
  // Require a real cookie session; legacy agents/API keys cannot manage credentials.
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  if (!session || session.user.id !== c.get("userId")) return c.json({ error: "Session required" }, 401);
  const origin = c.req.header("Origin");
  if (origin && ![c.env.APP_BASE_URL, new URL(c.req.url).origin].includes(origin)) return c.json({ error: "Untrusted origin" }, 403);
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !origin) return c.json({ error: "Origin required" }, 403);
  c.header("Cache-Control", "no-store");
  return next();
});
app.get("/", async (c) => {
  const db = getDb(c.env), userId = c.get("userId");
  const [settings, credentials] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db.select({ provider: userProviderCredentials.provider, last4: userProviderCredentials.last4, status: userProviderCredentials.status })
      .from(userProviderCredentials).where(eq(userProviderCredentials.userId, userId)),
  ]);
  return c.json({ chatModel: settings[0]?.chatModel ?? null, systemPrompt: settings[0]?.systemPrompt ?? null, credentials });
});
app.patch("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Invalid settings" }, 400);
  const values: { chatModel?: string | null; systemPrompt?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if ("chatModel" in body) {
    if (body.chatModel !== null) await validateChatModel(c.env, c.get("userId"), body.chatModel);
    values.chatModel = body.chatModel as string | null;
  }
  if ("systemPrompt" in body) {
    if (body.systemPrompt !== null && (typeof body.systemPrompt !== "string" || body.systemPrompt.length > 2000)) return c.json({ error: "Prompt must be at most 2000 characters" }, 400);
    values.systemPrompt = body.systemPrompt as string | null;
  }
  await getDb(c.env).insert(userSettings).values({ userId: c.get("userId"), ...values })
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
  return c.json({ ok: true });
});
app.put("/keys/:provider", async (c) => {
  const name = provider(c.req.param("provider"));
  const body = await c.req.json<{ key?: unknown }>();
  if (typeof body?.key !== "string" || body.key.length < 8 || body.key.length > 1024 || /\s/.test(body.key)) return c.json({ error: "Invalid key" }, 400);
  await validateKey(name, body.key);
  return c.json({ last4: await storeKey(c.env, c.get("userId"), name, body.key) });
});
app.delete("/keys/:provider", async (c) => {
  await getDb(c.env).delete(userProviderCredentials).where(and(eq(userProviderCredentials.userId, c.get("userId")), eq(userProviderCredentials.provider, provider(c.req.param("provider")))));
  return c.json({ ok: true });
});
app.get("/openrouter/connect", async (c) => {
  const { codeVerifier, challenge, state } = await createPkce();
  const now = new Date();
  await getDb(c.env).insert(verification).values({ id: crypto.randomUUID(), identifier: `openrouter:${c.get("userId")}:${state}`,
    value: codeVerifier, expiresAt: new Date(now.getTime() + 600000), createdAt: now, updatedAt: now });
  const url = new URL("https://openrouter.ai/auth");
  url.search = new URLSearchParams({ callback_url: `${c.env.BETTER_AUTH_URL}/api/settings/openrouter/callback`, state,
    code_challenge: challenge, code_challenge_method: "S256" }).toString();
  // OpenRouter preserves query parameters in callback_url, not a separate state parameter.
  url.searchParams.set("callback_url", `${c.env.BETTER_AUTH_URL}/api/settings/openrouter/callback?state=${state}`);
  return c.redirect(url.toString());
});
app.get("/openrouter/callback", async (c) => {
  const state = c.req.query("state") ?? "", code = c.req.query("code");
  if (!code || code.length > 2048) return c.json({ error: "Invalid authorization callback" }, 400);
  const codeVerifier = await consumePkce(getDb(c.env), state, c.get("userId"));
  if (!codeVerifier) return c.json({ error: "Authorization expired or already used" }, 400);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: "S256" }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("exchange failed");
    const data = await response.json() as { key?: unknown };
    if (typeof data.key !== "string" || data.key.length < 8 || data.key.length > 1024) throw new Error("invalid exchange");
    await storeKey(c.env, c.get("userId"), "openrouter", data.key);
    return c.redirect(`${c.env.APP_BASE_URL}/settings?connected=openrouter`);
  } catch {
    return c.redirect(`${c.env.APP_BASE_URL}/settings?error=openrouter`);
  }
});
export default app;
