import { Index } from "@upstash/vector";
import type { VectorStore, VectorEntry, VectorMatch, VectorQueryOptions } from "./types";

/**
 * Upstash Vector adapter behind the VectorStore interface.
 *
 * Requires two env vars (set as Worker secrets or in .dev.vars):
 *   UPSTASH_VECTOR_REST_URL   — e.g. https://<region>.vector.upstash.io
 *   UPSTASH_VECTOR_REST_TOKEN — read-write token from Upstash console
 *
 * Index must be created with 768 dimensions + cosine similarity to match
 * the EmbeddingGemma model used by Workers AI.
 */
export class UpstashVectorStore implements VectorStore {
  private index: Index;

  constructor(url: string, token: string) {
    this.index = new Index({ url, token });
  }

  async upsert(vectors: VectorEntry[]): Promise<{ count: number }> {
    await this.index.upsert(
      vectors.map((v) => ({
        id: v.id,
        vector: v.values,
        metadata: v.metadata ?? {},
      }))
    );
    return { count: vectors.length };
  }

  async query(
    vector: number[],
    options: VectorQueryOptions
  ): Promise<{ matches: VectorMatch[] }> {
    const filter = buildFilter(options.filter);

    const result = await this.index.query({
      vector,
      topK: options.topK ?? 10,
      includeMetadata: false,
      ...(filter ? { filter } : {}),
    });

    return {
      matches: result.map((m) => ({
        id: String(m.id),
        score: m.score,
      })),
    };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.index.delete(ids);
  }
}

/**
 * Convert a flat metadata object into an Upstash filter expression string.
 * Each key=value pair is ANDed together.
 *
 * Example: { source_type: "youtube", tags: "ai" }
 *   → "source_type = 'youtube' AND tags = 'ai'"
 */
function buildFilter(filter?: Record<string, string>): string | undefined {
  if (!filter || Object.keys(filter).length === 0) return undefined;

  return Object.entries(filter)
    .map(([k, v]) => `${k} = '${v.replace(/'/g, "\\'")}'`)
    .join(" AND ");
}
