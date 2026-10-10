import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import type { EmbeddingProvider } from "@internet-mindmap/shared";
import * as schema from "../../db/schema";
import type { getDb } from "../../db/client";
import type { EmbeddingRegistry } from "./registry";

type Db = ReturnType<typeof getDb>;

/**
 * Hash content for idempotency. Uses Web Crypto (available in Workers).
 * sha256(content) → hex, stored with each input for change detection.
 */
export async function hashContent(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * One logical "thing we want embedded" before we've hashed or written it.
 * The pipeline turns these into rows in `embedding_inputs` + `embedding_jobs`.
 */
export interface PendingEmbeddingInput {
  modality: "text" | "image" | "video_frame";
  content: string;
  chunkIndex: number;
  /** The chunker id that produced this input. */
  chunkerId: string;
}

/**
 * Describes what we want to insert into the legacy per-model destination
 * table (items.embedding or item_chunks.embedding) after embedding runs.
 * Only populated for the ACTIVE provider; shadow providers only fill
 * embedding_jobs so search still reads from the active columns.
 */
export interface LegacyDestination {
  /** "items" → write vector to items.embedding for itemId. */
  /** "item_chunks" → upsert {id, itemId, chunkIndex, embedding}. */
  table: "items" | "item_chunks";
  id: string;
  chunkIndex?: number;
}

/**
 * Write `embedding_inputs` rows (idempotent on item_id+modality+chunk_index)
 * and return their ids aligned with the given pending list.
 */
export async function upsertEmbeddingInputs(
  db: Db,
  itemId: string,
  pending: PendingEmbeddingInput[]
): Promise<{ inputId: string; contentHash: string; pending: PendingEmbeddingInput }[]> {
  if (pending.length === 0) return [];
  const values = await Promise.all(pending.map(async (p) => ({
    id: uuidv4(), itemId, modality: p.modality, chunkIndex: p.chunkIndex,
    content: p.content, contentHash: await hashContent(p.content), chunkerId: p.chunkerId,
  })));
  const rows = await db.insert(schema.embeddingInputs).values(values)
    .onConflictDoUpdate({
      target: [schema.embeddingInputs.itemId, schema.embeddingInputs.modality, schema.embeddingInputs.chunkIndex],
      set: {
        content: sql`excluded.content`, contentHash: sql`excluded.content_hash`,
        chunkerId: sql`excluded.chunker_id`,
      },
    })
    .returning({ id: schema.embeddingInputs.id, modality: schema.embeddingInputs.modality,
      chunkIndex: schema.embeddingInputs.chunkIndex, contentHash: schema.embeddingInputs.contentHash });
  const byKey = new Map(rows.map((row) => [`${row.modality}:${row.chunkIndex}`, row]));
  return pending.map((p) => {
    const row = byKey.get(`${p.modality}:${p.chunkIndex}`)!;
    return { inputId: row.id, contentHash: row.contentHash, pending: p };
  });
}

/**
 * Run one provider over a prepared set of inputs, record jobs, and
 * optionally mirror the vectors into a legacy destination.
 *
 * The optional writer receives the full batch and returns destinations
 * in the same order, so database requests do not grow with chunk count.
 */
export async function runProviderEmbed(
  db: Db,
  registry: EmbeddingRegistry,
  provider: EmbeddingProvider,
  itemId: string,
  inputs: { inputId: string; pending: PendingEmbeddingInput }[],
  legacyWriter?: (
    embeddings: { chunkIndex: number; modality: string; vector: number[] }[]
  ) => Promise<(LegacyDestination | null)[]>
): Promise<void> {
  // Filter to inputs this provider can handle.
  const supported = inputs.filter((i) =>
    provider.modalities.includes(i.pending.modality)
  );
  if (supported.length === 0) return;

  const vectors = await provider.embed(
    supported.map((i) => ({
      modality: i.pending.modality,
      content: i.pending.content,
    }))
  );

  if (vectors.length !== supported.length) {
    throw new Error(`Embedding provider ${provider.id} returned ${vectors.length} vectors for ${supported.length} inputs`);
  }

  const destinations = legacyWriter ? await legacyWriter(supported.map(({ pending }, i) => ({
    chunkIndex: pending.chunkIndex, modality: pending.modality, vector: vectors[i],
  }))) : supported.map(() => null);
  const jobs = supported.map(({ inputId }, i) => ({
    id: uuidv4(), inputId, itemId, providerId: provider.id,
    providerVersion: provider.version, dims: provider.dims, status: "done" as const,
    destinationTable: destinations[i]?.table ?? null,
    destinationId: destinations[i]?.id ?? null, completedAt: new Date(),
  }));
  await db.insert(schema.embeddingJobs).values(jobs).onConflictDoUpdate({
    target: [schema.embeddingJobs.inputId, schema.embeddingJobs.providerId],
    set: {
      status: "done", destinationTable: sql`excluded.destination_table`,
      destinationId: sql`excluded.destination_id`, lastError: null,
      completedAt: sql`excluded.completed_at`,
    },
  });

  // Suppress unused-import warnings until registry is consumed here.
  void registry;
}
