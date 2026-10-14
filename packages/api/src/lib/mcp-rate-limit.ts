import type { Env } from "../bindings";

export async function allowMcpRequest(env: Pick<Env, "MCP_RATE_LIMITER">, userId: string, clientId: string) {
  if (!env.MCP_RATE_LIMITER) return false;
  try {
    // ponytail: location-local approximate limits; use shared counters if global quotas are needed.
    const { success } = await env.MCP_RATE_LIMITER.limit({ key: JSON.stringify([userId, clientId]) });
    return success;
  } catch { return false; } // MCP never fails open, including binding outages.
}
