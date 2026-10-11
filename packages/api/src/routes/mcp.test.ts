import { it, expect, vi } from "vitest";
import { Hono } from "hono";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import type { Auth } from "../lib/auth";
import { mcpUrls } from "../lib/mcp-auth";
import mcpRoute from "./mcp";

const state = vi.hoisted(() => ({ calls: [] as string[], saved: [] as string[] }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  async limit() { return { success: true, pending: Promise.resolve() }; }
} }));
vi.mock("../lib/usage", () => ({ recordUsageEvent: async () => {} }));
vi.mock("../lib/search-kb", () => ({ searchKB: async (_env: unknown, userId: string) => {
  state.calls.push(userId);
  return { orderedItemIds: ["a"], itemById: new Map([["a", { id: "a", title: "A", url: "https://a.example", summary: "A" }]]), groupedByItem: new Map() };
} }));
vi.mock("../lib/save-item", async (original) => ({ ...await original<object>(), saveItem: async (_env: unknown, owner: string) => {
  state.saved.push(owner); return { id: "a", status: "pending" };
} }));
vi.mock("../db/client", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: async (where: SQL) => {
  const compiled = new PgDialect().sqlToQuery(where);
  expect(compiled.sql).toContain("user_id");
  expect(compiled.params).toContain("user-a");
  return []; // Non-owned / missing IDs are indistinguishable.
} }) }) }) }));

it("MCP HTTP rejects sessions, hostile origins, wrong hosts, missing rate limits and write scope; legacy clients list/call tools", async () => {
  const urls = mcpUrls({ BETTER_AUTH_URL: "https://kb.example" });
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: "test", alg: "EdDSA" }] };
  const access = (scope: string) => new SignJWT({ scope, client_id: "client" }).setSubject("user-a")
    .setIssuer(urls.issuer).setAudience(urls.resource).setIssuedAt().setExpirationTime("1h")
    .setProtectedHeader({ alg: "EdDSA", kid: "test", typ: "at+jwt" }).sign(privateKey);
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => { c.set("auth", { api: { getJwks: async () => jwks } } as unknown as Auth); c.set("requestId", "test"); await next(); });
  app.route("/api/mcp", mcpRoute);
  const env = { BETTER_AUTH_URL: "https://kb.example", UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "test" } as Env;
  const context = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} };
  const send = (body: unknown, value: string, headers: Record<string, string> = {}, overrides: Partial<Env> = {}) => app.request(urls.resource, {
    method: "POST", headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", Host: "kb.example", ...headers },
    body: JSON.stringify(body),
  }, { ...env, ...overrides }, context);
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  expect((await send(list, "session-token")).status).toBe(401);
  const read = await access("kb:read");
  expect((await send(list, read, { Origin: "https://attacker.example" })).status).toBe(403);
  expect((await send(list, read, { Host: "attacker.example" })).status).toBe(403);
  expect((await send(list, read, {}, { UPSTASH_REDIS_REST_TOKEN: undefined })).status).toBe(429);
  const decode = async (response: Response) => {
    const text = await response.text();
    return JSON.parse(text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").find((line) => line.startsWith("data:"))!.slice(5) : text);
  };
  const listed = await send(list, read);
  expect(listed.status).toBe(200);
  const payload = await decode(listed);
  expect(payload.result.tools.map((t: { name: string }) => t.name)).toEqual(["search", "fetch", "save_url"]);
  for (const tool of payload.result.tools) { expect(tool.title).toBeTruthy(); expect(tool.annotations.destructiveHint).toBe(false); }
  const search = await send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: "React", userId: "user-b" } } }, read);
  expect(search.status).toBe(200);
  expect(state.calls).toEqual(["user-a"]);
  const fetched = await decode(await send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fetch", arguments: { id: "user-b-item" } } }, read));
  expect(fetched.result.isError).toBe(true);
  const save = { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "save_url", arguments: { url: "https://example.com" } } };
  expect((await send(save, read)).status).toBe(403);
  expect(state.saved).toEqual([]);
  expect((await send(save, await access("kb:read kb:write"))).status).toBe(200);
  expect(state.saved).toEqual(["user-a"]);
});
