// Run: node packages/api/src/lib/byok.test.mjs
import assert from "node:assert/strict";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { APICallError, RetryError } from "ai";
import { Hono } from "hono";
let credentials = [], settings = [], consumed = false, expired = false;
const db = {
  select() { return { from(table) { return { async where() { return table === "settings" ? settings : credentials.filter((row) => row.status === "ok"); } }; } }; },
  delete() { return { where(condition) { return { async returning() {
    const identifier = condition.find((part) => part.column === "identifier").value;
    assert.ok(condition.find((part) => part.column === "expiresAt").value instanceof Date);
    if (expired || consumed || identifier !== `openrouter:owner:${state}`) return [];
    consumed = true; return [{ value: "verifier" }];
  } }; } }; },
};
const mocks = { getDb: () => db, userSettings: "settings", userProviderCredentials: { userId: "user", provider: "provider", status: "status" },
  verification: { identifier: "identifier", expiresAt: "expiresAt" },
  eq: (column, value) => ({ column, value }), gt: (column, value) => ({ column, value }), and: (...parts) => parts,
  createChatModel: () => ({ provider: "workers" }) };
globalThis.__byok = mocks;
const modelsUrl = new URL("../ai/llm/user-model.ts", import.meta.url).href;
const pkceUrl = new URL("./pkce.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const map = { "drizzle-orm": ["eq", "and", "gt"], "../../db/client": ["getDb"], "../db/client": ["getDb"],
      "../../db/schema": ["userSettings", "userProviderCredentials"], "../db/schema": ["verification"], "./chat-model": ["createChatModel"] };
    if ([modelsUrl, pkceUrl].includes(context.parentURL) && map[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(map[specifier].map((name) => `export const ${name} = globalThis.__byok.${name}`).join(";"))}`, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && !url.includes("node_modules")) return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8")) };
    return next(url, context);
  },
});
const env = { PROVIDER_KEY_KEK_V1: Buffer.alloc(32, 7).toString("base64"), AI: {} };
let state;
try {
  const { encryptProviderKey, decryptProviderKey } = await import("./crypto.ts");
  const row = await encryptProviderKey(env, "owner", "openai", "sk-test-secret");
  assert.equal(await decryptProviderKey(env, "owner", "openai", row), "sk-test-secret");
  assert.notEqual((await encryptProviderKey(env, "owner", "openai", "sk-test-secret")).iv, row.iv);
  await assert.rejects(decryptProviderKey(env, "intruder", "openai", row));
  await assert.rejects(decryptProviderKey(env, "owner", "google", row));
  await assert.rejects(decryptProviderKey({}, "owner", "openai", row));
  const { validateChatModel, getChatModel, chatProviderError } = await import(modelsUrl);
  await validateChatModel(env, "owner", "workers-ai:@cf/qwen/qwen3.8-27b");
  await assert.rejects(validateChatModel(env, "owner", "workers-ai:@cf/not-allowed"));
  await assert.rejects(validateChatModel(env, "owner", "openai:gpt-4.1"));
  credentials = [{ id: "key", ...row, status: "ok" }];
  await validateChatModel(env, "owner", "openai:gpt-4.1");
  await assert.rejects(validateChatModel(env, "agent", "openai:gpt-4.1"));
  const resolved = await getChatModel(env, "owner", "openai:gpt-4.1");
  assert.equal(resolved.modelId, "openai:gpt-4.1");
  // A key encrypted under another owner must fail, never resolve a Workers fallback.
  await assert.rejects(getChatModel(env, "intruder", "openai:gpt-4.1"));
  await assert.rejects(getChatModel({}, "owner", "openai:gpt-4.1"));
  credentials = [{ ...row, status: "invalid" }];
  await assert.rejects(validateChatModel(env, "owner", "openai:gpt-4.1"));
  credentials = []; settings = [{ chatModel: "openai:gpt-4.1" }];
  await assert.rejects(getChatModel(env, "owner"));
  assert.equal((await getChatModel(env, "agent")).modelId, "workers-ai:@cf/qwen/qwen3.8-27b");
  const rejected = new APICallError({ message: "secret", url: "https://example.com", requestBodyValues: {}, statusCode: 401 });
  assert.equal(chatProviderError(rejected, "openai:gpt-4.1").invalid, true);
  assert.equal(chatProviderError(rejected, "workers-ai:trusted"), null);
  const rateLimit = new APICallError({ message: "secret", url: "https://example.com", requestBodyValues: {}, statusCode: 429 });
  const retry = new RetryError({ message: "retry", reason: "maxRetriesExceeded", errors: [rateLimit] });
  assert.match(chatProviderError(retry, "openrouter:openai/gpt-4.1").message, /Rate limited/);
  const { createPkce, consumePkce } = await import(pkceUrl);
  const pkce = await createPkce(); state = pkce.state;
  assert.equal(pkce.challenge, Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pkce.codeVerifier))).toString("base64url"));
  assert.equal(await consumePkce(db, state, "intruder"), null);
  assert.equal(await consumePkce(db, state, "owner"), "verifier");
  assert.equal(await consumePkce(db, state, "owner"), null);
  assert.equal(await consumePkce(db, "invalid", "owner"), null);
  consumed = false; expired = true;
  assert.equal(await consumePkce(db, state, "owner"), null);
  const { corsMiddleware } = await import("../middleware/cors.ts");
  const app = new Hono().use("*", corsMiddleware).get("/", (c) => c.text("ok"));
  for (const origin of ["https://evil.pages.dev", "https://evilinternetmindmap.com", "https://internet-mindmap-evil.vercel.app"]) {
    const response = await app.request("/", { headers: { Origin: origin } }, { APP_BASE_URL: "https://internetmindmap.com" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const allowed = await app.request("/", { headers: { Origin: "https://internetmindmap.com" } }, { APP_BASE_URL: "https://internetmindmap.com" });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://internetmindmap.com");
  console.log("BYOK crypto/AAD, allowlist, no credential fallback, provider errors and PKCE owner/replay checks passed");
} finally { hooks.deregister(); delete globalThis.__byok; }
