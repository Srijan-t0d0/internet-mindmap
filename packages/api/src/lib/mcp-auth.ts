import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { Env } from "../bindings";

export function mcpUrls(env: Pick<Env, "BETTER_AUTH_URL">) {
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  return { resource: `${origin}/api/mcp`, issuer: `${origin}/api/auth`,
    metadata: `${origin}/.well-known/oauth-protected-resource/api/mcp` };
}

export class McpAuthError extends Error {
  constructor(public status: 401 | 403, public scope?: string) { super("MCP authorization failed"); }
}

// Only signature-verified OAuth access JWTs. No getSession, cookie or extension-token fallback.
export async function resolveUserId(request: Request, urls: ReturnType<typeof mcpUrls>, jwks: () => Promise<JSONWebKeySet>, requiredScope = "kb:read") {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("Authorization") ?? "");
  if (!match || match[1].split(".").length !== 3) throw new McpAuthError(401);
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], createLocalJWKSet(await jwks()), {
      issuer: urls.issuer, audience: urls.resource, algorithms: ["EdDSA"], typ: "at+jwt",
      requiredClaims: ["sub", "exp", "iat", "client_id", "scope"],
    }));
    // Single exact resource, not a broad multi-audience token; no sender-constrained token as bearer.
    if (payload.aud !== urls.resource || typeof payload.sub !== "string" || !payload.sub ||
        typeof payload.client_id !== "string" || !payload.client_id || typeof payload.scope !== "string" || payload.cnf) {
      throw new Error("Invalid access token claims");
    }
  } catch { throw new McpAuthError(401); }
  const scopes = new Set(payload.scope.split(" "));
  if (requiredScope && !scopes.has(requiredScope)) throw new McpAuthError(403, requiredScope);
  return { userId: payload.sub, clientId: payload.client_id as string, scopes };
}

export function mcpChallenge(urls: ReturnType<typeof mcpUrls>, error: McpAuthError) {
  const challenge = `Bearer resource_metadata="${urls.metadata}"` +
    (error.status === 403 ? `, error="insufficient_scope", scope="${error.scope}"` : "");
  return Response.json({ error: error.status === 403 ? "insufficient_scope" : "invalid_token" }, {
    status: error.status, headers: { "WWW-Authenticate": challenge, "Cache-Control": "no-store" },
  });
}
