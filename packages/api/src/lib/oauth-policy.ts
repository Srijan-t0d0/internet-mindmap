import type { OAuthOptions, Scope } from "@better-auth/oauth-provider";
import { APIError, createAuthMiddleware } from "better-auth/api";

// DCR metadata is untrusted. Remote JWKS and backchannel logout would cause
// server-side fetches with the same missing DNS-pinning boundary as CIMD.
export const oauthMetadataGuard = createAuthMiddleware(async (ctx) => {
  if (!ctx.path.includes("oauth2") || !ctx.body) return;
  const body = ctx.body as Record<string, unknown>;
  const update = body.update && typeof body.update === "object" ? body.update as Record<string, unknown> : {};
  if (["jwks_uri", "jwksUri", "backchannel_logout_uri", "backchannelLogoutUri"].some((key) => body[key] || update[key])) {
    throw new APIError("BAD_REQUEST", { error: "invalid_client_metadata", error_description: "Remote client key and logout URLs are not supported" });
  }
  // 1.7.7 has no default-application-type policy option. Normalize only DCR
  // omissions; the provider still validates every redirect and enforces PKCE.
  if (ctx.path === "/oauth2/register" && body.application_type === undefined && Array.isArray(body.redirect_uris)) {
    const native = body.redirect_uris.some((uri) => {
      if (typeof uri !== "string") return false;
      try { return new URL(uri).protocol !== "https:"; } catch { return false; }
    });
    if (native) return { context: { body: { ...body, application_type: "native" } } };
  }
});

export function oauthOptions(resource: string): OAuthOptions<Scope[]> {
  return {
    resources: [resource], clientRegistrationDefaultResources: [resource],
    scopes: ["openid", "profile", "email", "offline_access", "kb:read", "kb:write"],
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true,
    allowPublicClientPrelogin: true, clientRegistrationRequirePKCE: true,
    clientRegistrationDefaultScopes: ["openid", "profile", "email", "offline_access", "kb:read"],
    clientRegistrationAllowedScopes: ["kb:write"],
    consentPage: "/oauth/consent", loginPage: "/oauth/login",
  };
}
