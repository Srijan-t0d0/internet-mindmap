import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import * as schema from "../db/schema";
import { getDb } from "../db/client";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import {
  upsertEmbeddingInputs,
  runProviderEmbed,
  type PendingEmbeddingInput,
  type LegacyDestination,
} from "../ai/embeddings/pipeline";
import { CloudflareLLMProvider } from "../ai/llm/cloudflare";
import { fetchYouTubeTranscript } from "../lib/youtube";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
import type { Env } from "../bindings";

/**
 * The id stored in embedding_inputs.chunker_id for the single "enriched
 * document summary" input we build from title + notes + summary + key passages.
 * Bumped whenever the composition logic changes.
 */
const ENRICHED_CHUNKER_ID = "whole-doc-enriched-v1";

interface ProcessItemParams {
  itemId: string;
  url: string;
  source_type: string;
  userId?: string;
}

/**
 * Normalise a tag to consistent kebab-case.
 * "Machine Learning" → "machine-learning"
 */
function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class ProcessItemWorkflow extends WorkflowEntrypoint<Env, ProcessItemParams> {
  async run(event: WorkflowEvent<ProcessItemParams>, step: WorkflowStep) {
    const { itemId, url, source_type } = event.payload;
    const env = this.env;
    const db = getDb(env);
    const registry = buildEmbeddingRegistry(env);
    const activeProvider = registry.active();
    const writers = registry.writers();

    try {
      // Step 1: Mark as processing
      await step.do("update-status", async () => {
        await db
          .update(schema.items)
          .set({ status: "processing", updatedAt: new Date() })
          .where(eq(schema.items.id, itemId));
      });

      // Step 2: Fetch content
      const content = await step.do("fetch-content", async () => {
        const item = await db
          .select({
            rawContent: schema.items.rawContent,
            title: schema.items.title,
            notes: schema.items.notes,
          })
          .from(schema.items)
          .where(eq(schema.items.id, itemId))
          .then((rows) => rows[0] ?? null);

        if (!item) throw new Error(`Item ${itemId} not found`);

        let text = item.rawContent || "";

        // For YouTube, fetch transcript if no content
        if (source_type === "youtube" && !text) {
          const transcript = await fetchYouTubeTranscript(url);
          if (transcript) {
            text = transcript;
            await db
              .update(schema.items)
              .set({ rawContent: text.slice(0, 200_000), updatedAt: new Date() })
              .where(eq(schema.items.id, itemId));
          }
        }

        return { content: text, title: item.title, notes: item.notes || "" };
      });

      // Step 3: Generate tags + summary
      const llmResult = await step.do("generate-tags", async () => {
        if (!content.content) {
          return { betterTitle: "", tags: [], summary: "No content could be extracted.", keyPassages: [] };
        }

        // Fetch top-20 tags for this user by usage frequency
        const userId = event.payload.userId;
        let existingTags: string[] = [];
        if (userId) {
          const topTagRows = await db
            .select({ name: schema.tags.name, count: sql<number>`count(*)` })
            .from(schema.tags)
            .innerJoin(schema.itemTags, eq(schema.itemTags.tagId, schema.tags.id))
            .innerJoin(schema.items, eq(schema.items.id, schema.itemTags.itemId))
            .where(eq(schema.items.userId, userId))
            .groupBy(schema.tags.id)
            .orderBy(sql`count(*) desc`)
            .limit(20);
          existingTags = topTagRows.map((r) => r.name);
        }

        const llm = new CloudflareLLMProvider(env.AI);
        const result = await llm.generateTagsAndSummary(
          content.title,
          content.content,
          source_type,
          content.notes || undefined,
          existingTags
        );

        if (event.payload.userId) {
          recordUsageEvent(env, {
            userId: event.payload.userId,
            eventType: "tagging",
            source: "workflow",
            model: "@cf/qwen/qwen3-30b-a3b-fp8",
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            metadata: { itemId },
          }).catch(() => {});
        }

        return result;
      });

      // Step 4: Build embedding inputs + run all writer providers.
      //
      // We build the "pending inputs" list once (enriched doc + N chunks),
      // upsert them into embedding_inputs so a future model can re-embed
      // from the exact same text, then loop over every writer provider in
      // the registry (active + shadow). Only the active provider mirrors
      // into the legacy items.embedding / item_chunks.embedding columns
      // that search.ts reads from today.
      await step.do("embed-and-store", async () => {
        // ── Compose the "whole doc enriched" input ────────────────────────
        const parts: string[] = [content.title];
        if (content.notes) parts.push(`User notes: ${content.notes}`);
        if (llmResult.summary) parts.push(llmResult.summary);
        if (llmResult.keyPassages?.length)
          parts.push(llmResult.keyPassages.join(" "));
        const enrichedText = parts.join("\n\n");

        // ── Chunker owned by the active provider ──────────────────────────
        // If shadow providers want different chunks, they'll read the raw
        // rawContent from items and chunk themselves during backfill.
        const chunks = activeProvider.chunkText(content.content ?? "");

        const pending: PendingEmbeddingInput[] = [
          {
            modality: "text",
            content: enrichedText,
            chunkIndex: 0,
            chunkerId: ENRICHED_CHUNKER_ID,
          },
          ...chunks.map((chunk, i) => ({
            modality: "text" as const,
            content: chunk,
            chunkIndex: i + 1, // +1 because chunkIndex=0 is the enriched doc
            chunkerId: activeProvider.chunkerId,
          })),
        ];

        const inputs = await upsertEmbeddingInputs(db, itemId, pending);

        // Map chunkIndex -> the pre-allocated legacy row id we'll insert into
        // item_chunks. Pre-allocated so each shadow provider sees the same id.
        const chunkRowIds = new Map<number, string>();
        for (const p of pending) {
          if (p.chunkIndex >= 1) {
            chunkRowIds.set(p.chunkIndex, `${itemId}-c-${p.chunkIndex - 1}`);
          }
        }

        // Clear stale chunk rows from a prior processing pass (reindex case).
        // The active provider will re-populate them below.
        await db
          .delete(schema.itemChunks)
          .where(eq(schema.itemChunks.itemId, itemId));

        // ── Run every writer provider ─────────────────────────────────────
        for (const provider of writers) {
          const isActive = provider.id === activeProvider.id;

          await runProviderEmbed(
            db,
            registry,
            provider,
            itemId,
            inputs,
            async (chunkIndex, modality, vector): Promise<LegacyDestination | null> => {
              // Shadow providers stay out of the legacy columns — they write
              // to embedding_jobs only. Dedicated per-model tables come later.
              if (!isActive) return null;
              if (modality !== "text") return null;

              if (chunkIndex === 0) {
                // Whole-doc enriched vector → items.embedding
                await db
                  .update(schema.items)
                  .set({ embedding: vector, updatedAt: new Date() })
                  .where(eq(schema.items.id, itemId));
                return { table: "items", id: itemId };
              }
              // Per-chunk vector → item_chunks
              const chunkId = chunkRowIds.get(chunkIndex)!;
              await db.insert(schema.itemChunks).values({
                id: chunkId,
                itemId,
                chunkIndex: chunkIndex - 1, // back to 0-indexed on disk
                embedding: vector,
              });
              return { table: "item_chunks", id: chunkId };
            }
          );

          if (event.payload.userId) {
            const totalChars = pending
              .map((p) => p.content.length)
              .reduce((a, b) => a + b, 0);
            recordUsageEvent(env, {
              userId: event.payload.userId,
              eventType: "embedding",
              source: "workflow",
              model: provider.id,
              inputTokens: estimateEmbeddingTokens(" ".repeat(totalChars)),
              metadata: { itemId, shadow: !isActive, inputs: pending.length },
            }).catch(() => {});
          }
        }

        // Update item metadata (tags run in the next step; summary/chunkCount here).
        await db
          .update(schema.items)
          .set({
            summary: llmResult.summary,
            keyPassages: llmResult.keyPassages,
            chunkCount: chunks.length,
            status: "ready",
            lastError: null,
            userId: event.payload.userId || null,
            title: llmResult.betterTitle || undefined,
            updatedAt: new Date(),
          })
          .where(eq(schema.items.id, itemId));
      });

      // Step 5: Upsert tags (unchanged)
      await step.do("store-tags", async () => {
        const tagNames = llmResult.tags
          .map(normalizeTag)
          .filter(Boolean)
          .slice(0, 7);

        for (let i = 0; i < tagNames.length; i++) {
          const normalised = tagNames[i];

          let tagRow = await db
            .select({ id: schema.tags.id })
            .from(schema.tags)
            .where(eq(schema.tags.name, normalised))
            .then((rows) => rows[0] ?? null);

          if (!tagRow) {
            const tagId = uuidv4();
            await db.insert(schema.tags).values({ id: tagId, name: normalised });
            tagRow = { id: tagId };
          }

          try {
            await db.insert(schema.itemTags).values({
              itemId,
              tagId: tagRow.id,
              source: "auto",
              position: i,
            });
          } catch {
            // Duplicate — already linked
          }
        }
      });
    } catch (err) {
      await step.do("mark-error", async () => {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.items)
          .set({
            status: "error",
            lastError: message,
            errorCount: sql`error_count + 1`,
            updatedAt: new Date(),
          })
          .where(eq(schema.items.id, itemId));
      });
      throw err;
    }
  }
}
