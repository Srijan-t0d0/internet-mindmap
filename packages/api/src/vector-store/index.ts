export type { VectorStore, VectorEntry, VectorMatch, VectorQueryOptions } from "./types";
export { D1VectorStore } from "./d1";
export { CloudflareVectorStore } from "./cloudflare";

import type { Env } from "../bindings";
import type { VectorStore } from "./types";
import { D1VectorStore } from "./d1";
import { CloudflareVectorStore } from "./cloudflare";

/**
 * Create the appropriate vector store based on VECTOR_PROVIDER env var.
 *
 * Supported providers:
 *   "d1"        — local D1-backed store (default for local dev)
 *   "vectorize" — Cloudflare Vectorize binding (default for production)
 *
 * To add Upstash, Pinecone, etc: implement VectorStore and add a case here.
 */
export function createVectorStore(env: Env): VectorStore {
  const provider = env.VECTOR_PROVIDER || "d1";

  switch (provider) {
    case "d1":
      return new D1VectorStore(env.DB);
    case "vectorize":
      if (!env.VECTORIZE) throw new Error("VECTORIZE binding not available");
      return new CloudflareVectorStore(env.VECTORIZE);
    default:
      throw new Error(`Unknown VECTOR_PROVIDER: ${provider}`);
  }
}
