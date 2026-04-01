import type { VectorStore, VectorEntry, VectorMatch, VectorQueryOptions } from "./types";

/**
 * D1-backed vector store for local dev.
 * Stores 768d embeddings as JSON in SQLite, brute-force cosine similarity.
 * Requires the `vectors` table (see migrate-add-vectors.sql).
 */
export class D1VectorStore implements VectorStore {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async upsert(vectors: VectorEntry[]): Promise<{ count: number }> {
    for (const v of vectors) {
      await this.db
        .prepare(
          `INSERT OR REPLACE INTO vectors (id, values_json, metadata_json) VALUES (?, ?, ?)`
        )
        .bind(v.id, JSON.stringify(v.values), JSON.stringify(v.metadata || {}))
        .run();
    }
    return { count: vectors.length };
  }

  async query(
    vector: number[],
    options: VectorQueryOptions
  ): Promise<{ matches: VectorMatch[] }> {
    const rows = await this.db
      .prepare(`SELECT id, values_json, metadata_json FROM vectors`)
      .all<{ id: string; values_json: string; metadata_json: string }>();

    let candidates = rows.results || [];

    if (options.filter && Object.keys(options.filter).length > 0) {
      candidates = candidates.filter((row) => {
        const meta = JSON.parse(row.metadata_json || "{}");
        return Object.entries(options.filter!).every(([k, v]) => meta[k] === v);
      });
    }

    const scored = candidates.map((row) => {
      const values = JSON.parse(row.values_json) as number[];
      return { id: row.id, score: cosineSimilarity(vector, values) };
    });

    scored.sort((a, b) => b.score - a.score);
    return { matches: scored.slice(0, options.topK || 10) };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.db.prepare(`DELETE FROM vectors WHERE id = ?`).bind(id).run();
    }
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
