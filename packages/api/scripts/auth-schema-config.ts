// Schema generation only; no production secrets, real database or resource seeding.
// cd packages/api && pnpm dlx auth@1.7.7 generate --config scripts/auth-schema-config.ts --output scripts/auth-generated.ts --yes
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
export const auth = betterAuth({
  database: drizzleAdapter(getDb({ DATABASE_URL: "postgres://unused:unused@localhost:5432/unused" }), { provider: "pg", schema }),
  baseURL: "https://internet-mindmap.vercel.app", basePath: "/api/auth",
  secret: "schema-generation-only-not-a-production-secret",
  plugins: [bearer(), jwt(), oauthProvider({ loginPage: "/oauth/login", consentPage: "/oauth/consent" })],
});
