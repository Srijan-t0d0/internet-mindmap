import { sql } from "drizzle-orm";
import type { getDb } from "../db/client";

type Db = ReturnType<typeof getDb>;

// Extends Record<string, unknown> to satisfy drizzle's db.execute<T> constraint
export type VectorMatch = {
  item_id: string;
  score: number;
} & Record<string, unknown>;

/**
 * Per-passage match. `chunk_id`/`chunk_index`/`text` are null when the row
 * matched on the doc-level enriched embedding (items.embedding) rather
 * than a chunk row. The chat pipeline groups by item_id downstream.
 */
export type PassageMatch = {
  item_id: string;
  chunk_id: string | null;
  chunk_index: number | null;
  text: string | null;
  score: number;
} & Record<string, unknown>;

/** Serialize a number[] embedding to a pgvector literal: "[0.1,0.2,...]" */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Score items via UNION of doc-level embeddings (items.embedding) and
 * chunk-level embeddings (item_chunks.embedding), then collapse to the
 * best score per item using MAX(score).
 *
 * Pass userId to scope results to a single user (web / agent per-user).
 * Omit userId for a global search (agent cross-user mode).
 */
export async function vectorSearch(
  db: Db,
  embeddingLiteral: string,
  limit: number,
  userId?: string
): Promise<VectorMatch[]> {
  if (userId) {
    const result = await db.execute<VectorMatch>(sql`
      WITH scores AS (
        SELECT id AS item_id,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS score
        FROM items
        WHERE user_id = ${userId}
          AND status = 'ready'
          AND embedding IS NOT NULL
        UNION ALL
        SELECT ic.item_id,
               1 - (ic.embedding <=> ${embeddingLiteral}::vector) AS score
        FROM item_chunks ic
        JOIN items i ON ic.item_id = i.id
        WHERE i.user_id = ${userId}
          AND i.status = 'ready'
      )
      SELECT item_id, MAX(score) AS score
      FROM scores
      GROUP BY item_id
      ORDER BY MAX(score) DESC
      LIMIT ${limit}
    `);
    return result.rows;
  }

  // Global search — no user_id filter (agent cross-user mode)
  const result = await db.execute<VectorMatch>(sql`
    WITH scores AS (
      SELECT id AS item_id,
             1 - (embedding <=> ${embeddingLiteral}::vector) AS score
      FROM items
      WHERE status = 'ready'
        AND embedding IS NOT NULL
      UNION ALL
      SELECT ic.item_id,
             1 - (ic.embedding <=> ${embeddingLiteral}::vector) AS score
      FROM item_chunks ic
      JOIN items i ON ic.item_id = i.id
      WHERE i.status = 'ready'
    )
    SELECT item_id, MAX(score) AS score
    FROM scores
    GROUP BY item_id
    ORDER BY MAX(score) DESC
    LIMIT ${limit}
  `);
  return result.rows;
}

/**
 * Passage-level FTS search over `item_chunks.fts` (a Postgres tsvector
 * generated from `context_prefix || text`, indexed with GIN). Returns
 * `PassageMatch` rows compatible with `vectorSearchPassages` so the chat
 * pipeline can fuse them via RRF without case-handling per source.
 *
 * `score` here is `ts_rank_cd` normalised into a 0-1ish band; the absolute
 * value isn't comparable to the cosine score from dense search — RRF only
 * cares about rank position, not raw magnitude.
 */
export async function ftsSearchPassages(
  db: Db,
  query: string,
  limit: number,
  userId: string
): Promise<PassageMatch[]> {
  const result = await db.execute<PassageMatch>(sql`
    SELECT ic.item_id,
           ic.id AS chunk_id,
           ic.chunk_index AS chunk_index,
           ic.text AS text,
           ts_rank_cd(ic.fts, q) AS score
    FROM item_chunks ic
    JOIN items i ON ic.item_id = i.id,
         websearch_to_tsquery('english', ${query}) AS q
    WHERE i.user_id = ${userId}
      AND i.status = 'ready'
      AND ic.fts @@ q
    ORDER BY ts_rank_cd(ic.fts, q) DESC
    LIMIT ${limit}
  `);
  return result.rows;
}

/**
 * Reciprocal Rank Fusion. Standard RRF formula `sum(1/(k+rank))` per item
 * across all input rankings. `k=60` is the canonical default from Cormack
 * et al.; raising it dampens the bonus from being top-1 in any single list.
 *
 * The fused identity is "item_id + chunk_id" so the same passage from the
 * same item appearing in both rankings counts once with combined weight.
 * Doc-level matches (chunk_id=null) get keyed as `${itemId}::doc`.
 */
export function rrfFuse(
  rankings: PassageMatch[][],
  limit: number,
  k: number = 60
): PassageMatch[] {
  const scores = new Map<string, number>();
  const rows = new Map<string, PassageMatch>();
  for (const list of rankings) {
    list.forEach((row, idx) => {
      const key = row.chunk_id ? `${row.item_id}::${row.chunk_id}` : `${row.item_id}::doc`;
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + idx + 1));
      if (!rows.has(key)) rows.set(key, row);
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, fusedScore]) => ({ ...rows.get(key)!, score: fusedScore }));
}

/**
 * Passage-level dense search — returns one row per matching passage
 * (doc-level OR chunk-level), without the MAX(score) collapse. Use this
 * from the chat pipeline so multiple chunks from the same item can each
 * contribute a quoted passage. Caller is responsible for diversity caps.
 */
export async function vectorSearchPassages(
  db: Db,
  embeddingLiteral: string,
  limit: number,
  userId: string
): Promise<PassageMatch[]> {
  const result = await db.execute<PassageMatch>(sql`
    SELECT item_id, chunk_id, chunk_index, text, score FROM (
      SELECT id AS item_id,
             NULL::text AS chunk_id,
             NULL::int AS chunk_index,
             NULL::text AS text,
             1 - (embedding <=> ${embeddingLiteral}::vector) AS score
      FROM items
      WHERE user_id = ${userId}
        AND status = 'ready'
        AND embedding IS NOT NULL
      UNION ALL
      SELECT ic.item_id,
             ic.id AS chunk_id,
             ic.chunk_index AS chunk_index,
             ic.text AS text,
             1 - (ic.embedding <=> ${embeddingLiteral}::vector) AS score
      FROM item_chunks ic
      JOIN items i ON ic.item_id = i.id
      WHERE i.user_id = ${userId}
        AND i.status = 'ready'
    ) AS passages
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result.rows;
}
