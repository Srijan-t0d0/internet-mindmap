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
import { getModels } from "../ai/llm/models";
import { contextualizeChunks } from "../lib/contextualize";
import { fetchYouTubeTranscript } from "../lib/youtube";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
import { createLogger, log } from "evlog";
import type { ProcessItemParams } from "../lib/enqueue";
import type { Env } from "../bindings";

/**
 * The id stored in embedding_inputs.chunker_id for the single "enriched
 * document summary" input we build from title + notes + summary + key passages.
 * Bumped whenever the composition logic changes.
 */
const ENRICHED_CHUNKER_ID = "whole-doc-enriched-v1";

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
    const context = { requestId: event.payload.requestId, workflowId: event.instanceId, itemId, sourceType: source_type };
    const runLog = createLogger({ ...context, event: "workflow.run" });
    let currentStep = "initialize";
    let failure: unknown;
    let failed = false;
    let errorStatusPersisted = false;
    const runStep = <T extends Rpc.Serializable<T>>(name: string, callback: () => Promise<T>) => {
      currentStep = name;
      return step.do(name, async ({ attempt }) => {
        const stepLog = createLogger({ ...context, event: "workflow.step", step: name, attempt });
        let error: unknown;
        let success = false;
        try {
          const result = await callback();
          success = true;
          return result;
        } catch (err) {
          error = err;
          throw err;
        } finally {
          if (!success) stepLog.error(error instanceof Error ? error : String(error));
          stepLog.emit({ outcome: success ? "complete" : "error" });
        }
      });
    };

    try {
      const db = getDb(env);
      const registry = buildEmbeddingRegistry(env);
      const activeProvider = registry.active();
      const writers = registry.writers();
      // Step 1: Mark as processing
      await runStep("update-status", async () => {
        await db
          .update(schema.items)
          .set({ status: "processing", updatedAt: new Date() })
          .where(eq(schema.items.id, itemId));
      });

      // Step 2: Fetch content
      const content = await runStep("fetch-content", async () => {
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
      const llmResult = await runStep("generate-tags", async () => {
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

        const taggingModel = getModels(env).tagging;
        const llm = new CloudflareLLMProvider(env.AI, taggingModel);
        const result = await llm.generateTagsAndSummary(
          content.title,
          content.content,
          source_type,
          content.notes || undefined,
          existingTags
        );

        if (event.payload.userId) {
          await recordUsageEvent(env, {
            userId: event.payload.userId,
            requestId: context.requestId,
            workflowId: context.workflowId,
            eventType: "tagging",
            source: "workflow",
            model: taggingModel,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            metadata: { itemId },
          });
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
      await runStep("embed-and-store", async () => {
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

        // ── Contextual retrieval (Anthropic-style) ────────────────────────
        // For long, multi-chunk documents, ask the auxiliary LLM to write a
        // 1-sentence prefix per chunk that situates it inside the parent
        // doc. Prefix gets prepended to the chunk before embedding AND
        // stored in item_chunks.context_prefix so the FTS index covers it.
        // Skip short docs — they have implicit context already.
        const contextualEligible =
          chunks.length >= 3 && (content.content?.length ?? 0) >= 4000;
        const prefixes: string[] = contextualEligible
          ? await contextualizeChunks({
              ai: env.AI,
              model: getModels(env).auxiliary,
              title: content.title,
              summary: llmResult.summary,
              chunks,
            })
          : new Array(chunks.length).fill("");

        const isContextualised = prefixes.some((p) => p && p.length > 0);
        const chunkerId = isContextualised
          ? `${activeProvider.chunkerId}-contextual-v1`
          : activeProvider.chunkerId;

        const pending: PendingEmbeddingInput[] = [
          {
            modality: "text",
            content: enrichedText,
            chunkIndex: 0,
            chunkerId: ENRICHED_CHUNKER_ID,
          },
          ...chunks.map((chunk, i) => ({
            modality: "text" as const,
            // Prepend the contextual prefix so the embedding sees the
            // chunk-in-context. Falls back to plain chunk when no prefix.
            content: prefixes[i] ? `${prefixes[i]}\n\n${chunk}` : chunk,
            chunkIndex: i + 1, // +1 because chunkIndex=0 is the enriched doc
            chunkerId,
          })),
        ];

        if (event.payload.userId && isContextualised) {
          await recordUsageEvent(env, {
            userId: event.payload.userId,
            requestId: context.requestId,
            workflowId: context.workflowId,
            eventType: "contextualize",
            source: "workflow",
            model: getModels(env).auxiliary,
            metadata: {
              itemId,
              chunkCount: chunks.length,
              prefixedCount: prefixes.filter(Boolean).length,
            },
          });
        }

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
            async (embeddings): Promise<(LegacyDestination | null)[]> => {
              // Shadow providers record jobs without touching searchable vectors.
              if (!isActive) return embeddings.map(() => null);
              const textEmbeddings = embeddings.filter((e) => e.modality === "text");
              const wholeDoc = textEmbeddings.find((e) => e.chunkIndex === 0);
              if (wholeDoc) {
                await db.update(schema.items)
                  .set({ embedding: wholeDoc.vector, updatedAt: new Date() })
                  .where(eq(schema.items.id, itemId));
              }
              const chunkRows = textEmbeddings.filter((e) => e.chunkIndex > 0)
                .map(({ chunkIndex, vector }) => ({
                  id: chunkRowIds.get(chunkIndex)!, itemId,
                  chunkIndex: chunkIndex - 1, embedding: vector,
                  text: chunks[chunkIndex - 1] ?? null,
                  contextPrefix: prefixes[chunkIndex - 1] || null,
                }));
              if (chunkRows.length) await db.insert(schema.itemChunks).values(chunkRows);
              return embeddings.map(({ modality, chunkIndex }) => modality !== "text" ? null
                : chunkIndex === 0 ? { table: "items", id: itemId }
                : { table: "item_chunks", id: chunkRowIds.get(chunkIndex)! });
            }
          );

          if (event.payload.userId) {
            const totalChars = pending
              .map((p) => p.content.length)
              .reduce((a, b) => a + b, 0);
            await recordUsageEvent(env, {
              userId: event.payload.userId,
              requestId: context.requestId,
              workflowId: context.workflowId,
              eventType: "embedding",
              source: "workflow",
              model: provider.id,
              inputTokens: estimateEmbeddingTokens(" ".repeat(totalChars)),
              metadata: { itemId, shadow: !isActive, inputs: pending.length },
            });
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
      await runStep("store-tags", async () => {
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

          await db.insert(schema.itemTags).values({
            itemId,
            tagId: tagRow.id,
            source: "auto",
            position: i,
          }).onConflictDoNothing();
        }
      });
    } catch (err) {
      failure = err;
      failed = true;
      const failedStep = currentStep;
      try {
        await runStep("mark-error", async () => {
          const db = getDb(env);
          await db.update(schema.items).set({
            status: "error",
            lastError: "Processing failed; see workflow logs for details.",
            errorCount: sql`error_count + 1`,
            updatedAt: new Date(),
          }).where(eq(schema.items.id, itemId));
        });
        errorStatusPersisted = true;
      } catch (statusError) {
        log.error({
          event: "workflow.error_status.failed",
          ...context, failedStep, error: statusError, originalError: err,
        });
      }
      currentStep = failedStep;
      // Preserve the original failure even if recording its status also failed.
      throw err;
    } finally {
      if (failed) runLog.error(failure instanceof Error ? failure : String(failure));
      runLog.emit({
        outcome: failed ? "error" : "complete", step: currentStep,
        _durationMs: Date.now() - event.timestamp.getTime(),
        errorStatusPersisted: failed ? errorStatusPersisted : undefined,
      });
    }
  }
}
