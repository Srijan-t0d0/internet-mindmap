import { sql } from "drizzle-orm";
import type { getDb } from "../db/client";

type Db = ReturnType<typeof getDb>;

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

/** Optional item filters, applied inside the SQL so they narrow candidates before LIMIT. */
export type SearchFilters = { sourceType?: string; tag?: string; since?: Date; until?: Date };

function filterSql(f: SearchFilters) {
  const parts = [];
  if (f.sourceType) parts.push(sql`AND i.source_type = ${f.sourceType}`);
  if (f.since) parts.push(sql`AND i.created_at >= ${f.since.toISOString()}::timestamptz`);
  if (f.until) parts.push(sql`AND i.created_at < ${f.until.toISOString()}::timestamptz`);
  if (f.tag) parts.push(sql`AND EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = i.id AND t.name = ${f.tag})`);
  return sql.join(parts, sql` `);
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
  userId: string,
  filters: SearchFilters = {}
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
      ${filterSql(filters)}
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
  userId: string,
  filters: SearchFilters = {}
): Promise<PassageMatch[]> {
  // ponytail: ORDER BY over the UNION means a sequential scan, not HNSW.
  // Fine for a personal corpus; split into two index-ordered queries past ~50k chunks.
  const result = await db.execute<PassageMatch>(sql`
    SELECT item_id, chunk_id, chunk_index, text, score FROM (
      SELECT i.id AS item_id,
             NULL::text AS chunk_id,
             NULL::int AS chunk_index,
             NULL::text AS text,
             1 - (i.embedding <=> ${embeddingLiteral}::vector) AS score
      FROM items i
      WHERE i.user_id = ${userId}
        AND i.status = 'ready'
        AND i.embedding IS NOT NULL
        ${filterSql(filters)}
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
        ${filterSql(filters)}
    ) AS passages
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result.rows;
}
