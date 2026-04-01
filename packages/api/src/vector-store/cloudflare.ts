import type { VectorStore, VectorEntry, VectorMatch, VectorQueryOptions } from "./types";

/**
 * Thin adapter wrapping Cloudflare Vectorize binding behind VectorStore interface.
 */
export class CloudflareVectorStore implements VectorStore {
  private index: VectorizeIndex;

  constructor(index: VectorizeIndex) {
    this.index = index;
  }

  async upsert(vectors: VectorEntry[]): Promise<{ count: number }> {
    const result = await this.index.upsert(vectors);
    return { count: result.count };
  }

  async query(
    vector: number[],
    options: VectorQueryOptions
  ): Promise<{ matches: VectorMatch[] }> {
    const result = await this.index.query(vector, {
      topK: options.topK || 10,
      filter: options.filter && Object.keys(options.filter).length > 0
        ? options.filter
        : undefined,
    });

    return {
      matches: result.matches.map((m) => ({ id: m.id, score: m.score })),
    };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.index.deleteByIds(ids);
  }
}
