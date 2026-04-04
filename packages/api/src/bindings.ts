import type { Auth } from "./lib/auth";

export interface Env {
  DB: D1Database;
  VECTORIZE?: VectorizeIndex;
  AI: Ai;
  PROCESS_ITEM: Workflow;
  // Better Auth
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string; // API Worker URL — used as Better Auth's baseURL
  APP_BASE_URL: string;    // Web app URL — used for post-auth redirects & trusted origins
  // Legacy agent token (external AI agents)
  AGENT_API_TOKEN: string;
  VECTOR_PROVIDER?: string; // "d1" | "vectorize" | "upstash" — defaults to "d1"
}

export interface Variables {
  userId: string;
  auth: Auth; // Better Auth instance, created once per request
}
