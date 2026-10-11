import type { Auth } from "./lib/auth";
import type { EvlogVariables } from "evlog/hono";

export interface Env {
  DATABASE_URL: string;
  // Base64 32-byte AES KEKs. Keep old versions until credentials are re-encrypted.
  PROVIDER_KEY_KEK_V1?: string;
  PROVIDER_KEY_KEK_V2?: string;
  AI: Ai;
  PROCESS_ITEM: Workflow;
  // Better Auth
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_URL: string; // Public web origin — issuer and MCP resource share this origin
  APP_BASE_URL: string;    // Web app URL — used for post-auth redirects & trusted origins
  MCP_WORKER_ORIGIN?: string; // Trusted Worker origin behind the public reverse proxy
  MCP_INSPECTOR_ORIGIN?: string; // Optional exact browser Inspector origin
  // Admin-only maintenance token, never accepted by user or MCP routes
  AGENT_API_TOKEN: string;
  // Upstash Redis (rate limiting)
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  // Embedding provider selection (see ai/embeddings/registry.ts)
  // Default: "gemma-768-v2" active, no shadow.
  EMBEDDING_ACTIVE?: string;
  EMBEDDING_SHADOW?: string;
  // LLM model overrides (see ai/llm/models.ts).
  // Defaults are kept in code; set these only to flip without redeploying.
  LLM_SYNTHESIS?: string;
  LLM_AUXILIARY?: string;
  LLM_TAGGING?: string;
}

type LogVariables = EvlogVariables["Variables"];

export interface Variables extends LogVariables {
  requestId: string;
  userId: string;
  auth: Auth; // Better Auth instance, created once per request
}
