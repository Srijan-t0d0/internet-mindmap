import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { mcpUrls } from "./mcp-auth";
import { oauthOptions, oauthMetadataGuard } from "./oauth-policy";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import type { Env } from "../bindings";

export function createAuth(env: Env) {
  const db = getDb(env);
  const { resource, issuer } = mcpUrls(env);
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: env.BETTER_AUTH_SECRET,
    // One public web origin owns login, consent, discovery and MCP.
    baseURL: new URL(env.BETTER_AUTH_URL).origin,
    basePath: "/api/auth",
    hooks: { before: oauthMetadataGuard },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      // Allows session tokens to be sent as Authorization: Bearer <token>
      // Used by the browser extension instead of cookies
      bearer(),
      jwt({ jwt: { issuer }, disableSettingJwtHeader: true }),
      oauthProvider(oauthOptions(resource)),
      // CIMD stays off: Workers fetch cannot pin DNS peers. DCR is the safe fallback.
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year — extension tokens stay valid
      updateAge: 60 * 60 * 24 * 7,   // extend once a week on active use
    },
    trustedOrigins: [
      "http://localhost:3030", // Next.js dev server
      "http://localhost:5173", // Vite dev server (legacy)
      "http://localhost:4173", // Vite preview (legacy)
      // Browser extension origins — wildcard matches any extension ID so
      // we don't have to hardcode the CRX-signed Chrome ID or Firefox UUID.
      "chrome-extension://*",
      "moz-extension://*",
      ...(env.APP_BASE_URL ? [env.APP_BASE_URL] : []),
      ...(env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
