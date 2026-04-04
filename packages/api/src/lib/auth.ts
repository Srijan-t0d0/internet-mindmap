import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import type { Env } from "../bindings";

export function createAuth(env: Env) {
  return betterAuth({
    database: {
      db: env.DB,
      type: "sqlite",
    },
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
