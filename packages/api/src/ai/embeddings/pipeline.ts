import { v4 as uuidv4 } from "uuid";
import { and, eq } from "drizzle-orm";
import type { EmbeddingProvider } from "@internet-mindmap/shared";
import * as schema from "../../db/schema";
import type { getDb } from "../../db/client";
import type { EmbeddingRegistry } from "./registry";

type Db = ReturnType<typeof getDb>;

/**
 * Hash content for idempotency. Uses Web Crypto (available in Workers).
 * sha256(content) → hex. Short-circuits re-embed when identical input
 * already has a done job row.
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
  /** The chunker id that produced this input. Must match a provider's chunkerId or be "whole-doc-enriched". */
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
  const out: { inputId: string; contentHash: string; pending: PendingEmbeddingInput }[] = [];
  for (const p of pending) {
    const contentHash = await hashContent(p.content);

    // Check if a row already exists for this (item, modality, chunk_index).
    const existing = await db
      .select({
        id: schema.embeddingInputs.id,
        contentHash: schema.embeddingInputs.contentHash,
      })
      .from(schema.embeddingInputs)
      .where(
        and(
          eq(schema.embeddingInputs.itemId, itemId),
          eq(schema.embeddingInputs.modality, p.modality),
          eq(schema.embeddingInputs.chunkIndex, p.chunkIndex)
        )
      )
      .then((rows) => rows[0] ?? null);

    if (existing) {
      if (existing.contentHash !== contentHash) {
        // Content changed — overwrite. Jobs referencing this input stay
        // linked; a re-embed pass will re-run them based on stale hash logic.
        await db
          .update(schema.embeddingInputs)
          .set({
            content: p.content,
            contentHash,
            chunkerId: p.chunkerId,
          })
          .where(eq(schema.embeddingInputs.id, existing.id));
      }
      out.push({ inputId: existing.id, contentHash, pending: p });
      continue;
    }

    const id = uuidv4();
    await db.insert(schema.embeddingInputs).values({
      id,
      itemId,
      modality: p.modality,
      chunkIndex: p.chunkIndex,
      content: p.content,
      contentHash,
      chunkerId: p.chunkerId,
    });
    out.push({ inputId: id, contentHash, pending: p });
  }
  return out;
}

/**
 * Run one provider over a prepared set of inputs, record jobs, and
 * optionally mirror the vectors into a legacy destination.
 *
 * `legacyDestinations` is keyed by (modality, chunkIndex) — the caller
 * decides whether this provider owns the legacy columns.
 */
export async function runProviderEmbed(
  db: Db,
  registry: EmbeddingRegistry,
  provider: EmbeddingProvider,
  itemId: string,
  inputs: { inputId: string; pending: PendingEmbeddingInput }[],
  legacyWriter?: (
    chunkIndex: number,
    modality: string,
    vector: number[]
  ) => Promise<LegacyDestination | null>
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

  for (let i = 0; i < supported.length; i++) {
    const { inputId, pending } = supported[i];
    const vector = vectors[i];

    const dest = legacyWriter
      ? await legacyWriter(pending.chunkIndex, pending.modality, vector)
      : null;

    // Upsert job row. Conflict on (input_id, provider_id).
    const existingJob = await db
      .select({ id: schema.embeddingJobs.id })
      .from(schema.embeddingJobs)
      .where(
        and(
          eq(schema.embeddingJobs.inputId, inputId),
          eq(schema.embeddingJobs.providerId, provider.id)
        )
      )
      .then((rows) => rows[0] ?? null);

    if (existingJob) {
      await db
        .update(schema.embeddingJobs)
        .set({
          status: "done",
          destinationTable: dest?.table ?? null,
          destinationId: dest?.id ?? null,
          lastError: null,
          completedAt: new Date(),
        })
        .where(eq(schema.embeddingJobs.id, existingJob.id));
    } else {
      await db.insert(schema.embeddingJobs).values({
        id: uuidv4(),
        inputId,
        itemId,
        providerId: provider.id,
        providerVersion: provider.version,
        dims: provider.dims,
        status: "done",
        destinationTable: dest?.table ?? null,
        destinationId: dest?.id ?? null,
        completedAt: new Date(),
      });
    }
  }

  // Suppress unused-import warnings until registry is consumed here.
  void registry;
}
