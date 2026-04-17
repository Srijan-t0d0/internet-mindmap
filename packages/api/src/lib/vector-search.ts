import { sql } from "drizzle-orm";
import type { getDb } from "../db/client";

type Db = ReturnType<typeof getDb>;

// Extends Record<string, unknown> to satisfy drizzle's db.execute<T> constraint
export type VectorMatch = {
  item_id: string;
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
