import type { Auth } from "./lib/auth";

export interface Env {
  DATABASE_URL: string;
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
  // Upstash Redis (rate limiting)
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  // Embedding provider selection (see ai/embeddings/registry.ts)
  // Default: "gemma-768-v1" active, no shadow.
  EMBEDDING_ACTIVE?: string;
  EMBEDDING_SHADOW?: string;
  // LLM model overrides (see ai/llm/models.ts).
  // Defaults are kept in code; set these only to flip without redeploying.
  LLM_SYNTHESIS?: string;
  LLM_AUXILIARY?: string;
  LLM_TAGGING?: string;
}

export interface Variables {
  userId: string;
  auth: Auth; // Better Auth instance, created once per request
}
