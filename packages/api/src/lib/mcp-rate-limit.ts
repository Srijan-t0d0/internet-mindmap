import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";
import type { Env } from "../bindings";

export async function allowMcpRequest(env: Env, userId: string, clientId: string, waitUntil: (task: Promise<unknown>) => void) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return false;
  try {
    const limiter = new Ratelimit({ redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "ratelimit:mcp" });
    const { success, pending } = await limiter.limit(JSON.stringify([userId, clientId]));
    waitUntil(pending);
    return success;
  } catch { return false; } // MCP never fails open, including Redis outages.
}
