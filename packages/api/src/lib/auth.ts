import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../bindings";

export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: env.BETTER_AUTH_SECRET,
    // Must be the API Worker URL — not the web app URL.
    // Better Auth uses this to build callback URLs and validate origins.
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
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
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year — extension tokens stay valid
      updateAge: 60 * 60 * 24 * 7,   // extend once a week on active use
    },
    trustedOrigins: [
      "http://localhost:3030", // Next.js dev server
      "http://localhost:5173", // Vite dev server (legacy)
      "http://localhost:4173", // Vite preview (legacy)
      ...(env.APP_BASE_URL ? [env.APP_BASE_URL] : []),
      ...(env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
