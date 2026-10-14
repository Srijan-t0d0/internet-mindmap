import { it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Env, Variables } from "../bindings";
import { createRateLimiter } from "./rate-limit";

const routes = [
  ["settings", "SETTINGS_RATE_LIMITER"], ["chat", "CHAT_RATE_LIMITER"],
  ["search", "SEARCH_RATE_LIMITER"], ["save", "SAVE_RATE_LIMITER"],
  ["import", "IMPORT_RATE_LIMITER"],
] as const;

it.each(routes)("limits %s root and subpaths using its native binding and authenticated user", async (route, binding) => {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (c, next) => { c.set("userId", c.req.header("X-Test-User") ?? "user-a"); await next(); });
  app.use(`/api/${route}/*`, createRateLimiter(binding));
  const handler = vi.fn(() => new Response("ok"));
  app.all(`/api/${route}`, handler);
  app.all(`/api/${route}/child`, handler);
  const limit = vi.fn(async () => ({ success: true }));
  const env = { [binding]: { limit } } as unknown as Env;
  expect((await app.request(`/api/${route}`, {}, env)).status).toBe(200);
  expect((await app.request(`/api/${route}/child`, { headers: { "X-Test-User": "user-b" } }, env)).status).toBe(200);
  expect(limit.mock.calls).toEqual([[{ key: "user-a" }], [{ key: "user-b" }]]);
  limit.mockResolvedValue({ success: false });
  const rejected = await app.request(`/api/${route}`, {}, env);
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get("Retry-After")).toBe("60");
  expect(handler).toHaveBeenCalledTimes(2);
  expect((await app.request(`/api/${route}`, {}, {} as Env)).status).toBe(503);
  limit.mockRejectedValue(new Error("binding unavailable"));
  expect((await app.request(`/api/${route}`, {}, env)).status).toBe(503);
  expect(handler).toHaveBeenCalledTimes(2);
});
