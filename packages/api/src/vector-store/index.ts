export type { VectorStore, VectorEntry, VectorMatch, VectorQueryOptions } from "./types";
export { D1VectorStore } from "./d1";
export { CloudflareVectorStore } from "./cloudflare";
export { UpstashVectorStore } from "./upstash";

import type { Env } from "../bindings";
import type { VectorStore } from "./types";
import { D1VectorStore } from "./d1";
import { CloudflareVectorStore } from "./cloudflare";
import { UpstashVectorStore } from "./upstash";

/**
 * Create the appropriate vector store based on VECTOR_PROVIDER env var.
 *
 * Supported providers:
 *   "d1"        — local D1-backed store (default for local dev)
 *   "vectorize" — Cloudflare Vectorize binding
 *   "upstash"   — Upstash Vector (requires UPSTASH_VECTOR_REST_URL + UPSTASH_VECTOR_REST_TOKEN)
 */
export function createVectorStore(env: Env): VectorStore {
  const provider = env.VECTOR_PROVIDER || "d1";

  switch (provider) {
    case "d1":
      return new D1VectorStore(env.DB);
    case "vectorize":
      if (!env.VECTORIZE) throw new Error("VECTORIZE binding not available");
      return new CloudflareVectorStore(env.VECTORIZE);
    case "upstash": {
      if (!env.UPSTASH_VECTOR_REST_URL || !env.UPSTASH_VECTOR_REST_TOKEN) {
        throw new Error(
          "Upstash vector provider requires UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN"
        );
      }
      return new UpstashVectorStore(env.UPSTASH_VECTOR_REST_URL, env.UPSTASH_VECTOR_REST_TOKEN);
    }
    default:
      throw new Error(`Unknown VECTOR_PROVIDER: ${provider}`);
  }
}
