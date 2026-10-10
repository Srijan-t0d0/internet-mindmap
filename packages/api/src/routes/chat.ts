import { Hono } from "hono";
import { inArray, and, eq, not, sql } from "drizzle-orm";
import {
  streamText,
  createUIMessageStreamResponse,
  createUIMessageStream,
  generateId,
  type UIMessage,
} from "ai";
import { createChatModel } from "../ai/llm/chat-model";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import {
  vectorSearchPassages,
  ftsSearchPassages,
  rrfFuse,
  toVectorLiteral,
} from "../lib/vector-search";
import { rerank } from "../lib/rerank";
import { condenseQuery, type CondenseTurn } from "../lib/condense";
import { generateFollowups } from "../lib/followups";
import { generateThreadTitle } from "../lib/title";
import { buildChatMessages } from "../ai/llm/prompts";
import { getModels, DEFAULT_MODELS } from "../ai/llm/models";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
import { log } from "evlog";
import * as schema from "../db/schema";

// ── Pre-classifier: detect purely conversational messages that don't need
//    retrieval. Cheap latency win — saves an embed + a vector query per "hi". ─
const CONVERSATIONAL_RE =
  /^(hi|hello|hey|thanks|thank you|ok|okay|got it|cool|great|sure|yes|no|bye|goodbye|sounds good|makes sense|awesome|perfect|nice|lol|😊|👋)\W*$/i;

function isConversational(text: string): boolean {
  return text.length < 40 && CONVERSATIONAL_RE.test(text.trim());
}

// ── Types ─────────────────────────────────────────────────────────────────────
type RawItem = {
  id: string;
  url: string;
  title: string;
  summary: string | null;
};

/**
 * One unit of evidence handed to the cross-encoder. `text` is what the
 * reranker scores against the query. `chunkId` is null for whole-doc
 * candidates (matched on items.embedding) and tag-graph candidates
 * (matched on shared tags, no vector match at all).
 */
type RerankUnit = {
  text: string;
  itemId: string;
  chunkId: string | null;
  fromGraph: boolean;
};

// ── Hono route ────────────────────────────────────────────────────────────────
// ── Persistence helpers ──────────────────────────────────────────────────
// Derive a short thread title from the first user message.
function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 60).trimEnd()}…` : trimmed;
}

type IncomingMsg = {
  id?: string;
  role: string;
  content?: string;
  parts?: { type: string; text?: string;[k: string]: unknown }[];
  metadata?: unknown;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>().post("/", async (c) => {
  const body = await c.req.json<{
    id?: string;
    messages?: IncomingMsg[];
  }>();

  const incomingMessages = body.messages ?? [];
  const lastUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");
  const question = (
    lastUserMsg?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ||
    lastUserMsg?.content ||
    ""
  ).trim();

  if (!question) return c.json({ error: "question is required" }, 400);
  if (question.length > 1000) return c.json({ error: "Question too long (max 1000 characters)" }, 400);

  const userId = c.get("userId");
  const models = getModels(c.env);
  const chatModel = createChatModel(c.env.AI, models.synthesis);

  // ── Thread id: client-supplied or server-generated ──────────────────────
  // `useChat({ id })` on the client propagates this as `body.id` via
  // DefaultChatTransport. If missing, we mint a new one so the first
  // exchange still gets persisted; the client can read it back if needed.
  const threadId = body.id && typeof body.id === "string" ? body.id : generateId();
  const db = getDb(c.env);

  // Upsert thread row (no-op on conflict except we bump updated_at).
  // Title is set on first insert from the first user message; later turns
  // keep whatever title the thread was created with.
  const [ownedThread] = await db
    .insert(schema.chatThreads)
    .values({
      id: threadId,
      userId,
      title: deriveTitle(question),
    })
    .onConflictDoUpdate({
      target: schema.chatThreads.id,
      set: { updatedAt: sql`now()` },
      // A client-supplied id must never claim another user's thread.
      setWhere: eq(schema.chatThreads.userId, userId),
    })
    .returning({ id: schema.chatThreads.id });
  if (!ownedThread) return c.json({ error: "Thread not found" }, 404);

  const onStreamError = (error: unknown) => {
    log.error({ event: "chat.execute.failed", requestId: c.get("requestId"), threadId,
      model: models.synthesis, error });
    return "Unable to answer right now. Please try again.";
  };

  // ── Self-RAG: skip retrieval for purely conversational messages ─────────────
  if (isConversational(question)) {
    const result = streamText({
      model: chatModel,
      system: "You are a friendly assistant for a personal knowledge base app. Respond naturally to short conversational messages.",
      messages: [{ role: "user", content: question }],
      maxOutputTokens: 256,
    });
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        onError: onStreamError,
        async execute({ writer }) {
          writer.merge(result.toUIMessageStream({ onError: onStreamError }));
        },
      }),
      headers: { "content-encoding": "identity", "cache-control": "no-cache, no-transform" },
    });
  }

  // Transient progress parts are excluded from the persisted UI messages.
  const originalMessages = incomingMessages as unknown as UIMessage[];
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages,
      onError: onStreamError,
      onFinish: async ({ messages: finalMessages }) => {
        try {
          const rows = finalMessages.map((m) => ({
            id: m.id,
            threadId,
            role: m.role as "user" | "assistant" | "system",
            parts: (m.parts ?? []) as typeof schema.chatMessages.$inferInsert.parts,
            metadata: (m.metadata ?? null) as typeof schema.chatMessages.$inferInsert.metadata,
          }));
          if (rows.length > 0) {
            await db
              .insert(schema.chatMessages)
              .values(rows)
              .onConflictDoUpdate({
                target: schema.chatMessages.id,
                set: { parts: sql`excluded.parts`, metadata: sql`excluded.metadata` },
                // Message ids are global; conflicts can only update this thread.
                setWhere: eq(schema.chatMessages.threadId, threadId),
              });
          }
          await db
            .update(schema.chatThreads)
            .set({ updatedAt: sql`now()` })
            .where(eq(schema.chatThreads.id, threadId));
        } catch (error) {
          log.error({
            event: "chat.persist.failed", requestId: c.get("requestId"), threadId,
            model: models.synthesis, error
          });
        }
      },
      async execute({ writer }) {
        // One stable message id owns both the sources and the answer.
        writer.write({ type: "start", messageId: generateId() });
        writer.write({ type: "data-status", data: { stage: "searching" }, transient: true });

        // ── Multi-turn condense: rewrite the latest message into a standalone
        //    search query using prior turns. Skipped on first turn. The rewrite
        //    is used ONLY for retrieval — the synthesis prompt still gets the
        //    user's original phrasing. ────────────────────────────────────────────
        const priorTurns: CondenseTurn[] = [];
        for (const m of incomingMessages) {
          if (m === lastUserMsg) continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          const text = (
            m.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ||
            m.content ||
            ""
          ).trim();
          if (text.length === 0) continue;
          priorTurns.push({ role: m.role as "user" | "assistant", text });
        }

        const retrievalQuery = await condenseQuery(
          c.env.AI,
          priorTurns,
          question,
          models.auxiliary
        );

        if (retrievalQuery !== question) {
          c.executionCtx.waitUntil(recordUsageEvent(c.env, {
            userId,
            requestId: c.get("requestId"),
            eventType: "condense",
            source: "web",
            model: models.auxiliary,
            metadata: {
              question: question.slice(0, 200),
              rewritten: retrievalQuery.slice(0, 200),
              priorTurns: priorTurns.length,
            },
          }));
        }

        // ── Embed the (condensed) query. HyDE was deleted — Anthropic's contextual
        //    retrieval (Step 5) plus the cross-encoder rerank (Step 3) cover the
        //    same recall lift HyDE used to provide on personal-KB domains, without
        //    HyDE's hallucination risk. ────────────────────────────────────────────
        const embedder = buildEmbeddingRegistry(c.env).active();

        // ── Hybrid retrieval: dense pgvector + sparse Postgres FTS, fused by RRF.
        //    Each branch returns up to K=20 raw passages; RRF picks the top 20
        //    fused passages for the cross-encoder to rerank. Dense covers
        //    semantic similarity; FTS covers exact-token matches (proper nouns,
        //    code identifiers, error codes) where dense embeddings smear. ─────────
        const [denseMatches, ftsMatches] = await Promise.all([
          embedder.embed([{ modality: "text", content: retrievalQuery }]).then(([queryEmbedding]) => {
            c.executionCtx.waitUntil(recordUsageEvent(c.env, {
              userId,
              requestId: c.get("requestId"),
              eventType: "embedding",
              source: "web",
              model: embedder.id,
              inputTokens: estimateEmbeddingTokens(retrievalQuery),
              metadata: { source: "chat-query" },
            }));
            return vectorSearchPassages(db, toVectorLiteral(queryEmbedding), 20, userId);
          }),
          ftsSearchPassages(db, retrievalQuery, 20, userId),
        ]);

        const passageMatches = rrfFuse([denseMatches, ftsMatches], 20);

        if (passageMatches.length === 0) {
          log.warn({ event: "chat.retrieval.empty", requestId: c.get("requestId"), threadId });
          writer.write({ type: "error", errorText: "No saved items found. Save some content first!" });
          return;
        }

        // Order-preserving unique item ids (best score first).
        const seedIdSet = new Set<string>();
        const seedIds: string[] = [];
        for (const m of passageMatches) {
          if (!seedIdSet.has(m.item_id)) {
            seedIdSet.add(m.item_id);
            seedIds.push(m.item_id);
          }
        }

        // ── Round-trip 1: fetch seed items + their tags in parallel ─────────────────
        const [seedItems, seedTagRows] = await Promise.all([
          db
            .select({
              id: schema.items.id,
              url: schema.items.url,
              title: schema.items.title,
              summary: schema.items.summary,
            })
            .from(schema.items)
            .where(and(inArray(schema.items.id, seedIds), eq(schema.items.userId, userId))),

          db
            .select({
              itemId: schema.itemTags.itemId,
              tagId: schema.itemTags.tagId,
              tagName: schema.tags.name,
            })
            .from(schema.itemTags)
            .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
            .where(inArray(schema.itemTags.itemId, seedIds)),
        ]);

        const tagsByItem = new Map<string, string[]>();
        const seedTagIdSet = new Set<string>();
        for (const row of seedTagRows) {
          const names = tagsByItem.get(row.itemId) ?? [];
          names.push(row.tagName);
          tagsByItem.set(row.itemId, names);
          seedTagIdSet.add(row.tagId);
        }
        const seedTagIds = [...seedTagIdSet];

        // ── Round-trip 2: tag-graph hop ─────────────────────────────────────────────
        const graphItems: RawItem[] =
          seedTagIds.length > 0
            ? await db
              .selectDistinct({
                id: schema.items.id,
                url: schema.items.url,
                title: schema.items.title,
                summary: schema.items.summary,
              })
              .from(schema.items)
              .innerJoin(schema.itemTags, eq(schema.itemTags.itemId, schema.items.id))
              .where(
                and(
                  inArray(schema.itemTags.tagId, seedTagIds),
                  not(inArray(schema.items.id, seedIds)),
                  eq(schema.items.userId, userId),
                  eq(schema.items.status, "ready")
                )
              )
              .limit(8)
            : [];

        // ── Build the rerank candidate pool ──────────────────────────────────────
        // One unit per piece of evidence: matched chunks (with their text), doc-level
        // dense matches (text = title + summary from seedItems), and tag-graph items
        // (also title + summary). The cross-encoder will score them all jointly
        // against the query and rank by genuine relevance.
        const itemById = new Map<string, RawItem>();
        for (const it of seedItems) itemById.set(it.id, it);
        for (const it of graphItems) itemById.set(it.id, it);

        const rerankInputs: RerankUnit[] = [];
        const seenChunkIds = new Set<string>();

        for (const m of passageMatches) {
          if (m.chunk_id && m.text) {
            // Skip duplicate chunks if the UNION ever produces them.
            if (seenChunkIds.has(m.chunk_id)) continue;
            seenChunkIds.add(m.chunk_id);
            rerankInputs.push({
              text: m.text,
              itemId: m.item_id,
              chunkId: m.chunk_id,
              fromGraph: false,
            });
          } else {
            // Doc-level match (matched on items.embedding). Use title + summary
            // as the rerank text so the cross-encoder has something to score.
            const item = itemById.get(m.item_id);
            if (!item) continue;
            rerankInputs.push({
              text: `${item.title}\n\n${item.summary ?? ""}`.trim(),
              itemId: m.item_id,
              chunkId: null,
              fromGraph: false,
            });
          }
        }

        for (const item of graphItems) {
          rerankInputs.push({
            text: `${item.title}\n\n${item.summary ?? ""}`.trim(),
            itemId: item.id,
            chunkId: null,
            fromGraph: true,
          });
        }

        // ── Cross-encoder rerank: precision pass over the candidate pool. We
        //    score against the condensed query so follow-ups like "and the React
        //    one?" rank against the resolved noun, not the bare pronoun. ────────
        const KEEP_TOP = 6;
        writer.write({ type: "data-status", data: { stage: "ranking" }, transient: true });
        const ranked = await rerank(c.env.AI, retrievalQuery, rerankInputs, KEEP_TOP);

        c.executionCtx.waitUntil(recordUsageEvent(c.env, {
          userId,
          requestId: c.get("requestId"),
          eventType: "rerank",
          source: "web",
          model: DEFAULT_MODELS.reranker,
          metadata: {
            candidates: rerankInputs.length,
            kept: ranked.length,
          },
        }));

        // ── Group ranked results by item, preserving rerank order ────────────────
        type GroupedItem = {
          itemId: string;
          fromGraph: boolean;
          passages: { chunkId: string; text: string }[];
          bestRerankScore: number;
        };
        const groupedByItem = new Map<string, GroupedItem>();
        for (const r of ranked) {
          let g = groupedByItem.get(r.itemId);
          if (!g) {
            g = {
              itemId: r.itemId,
              fromGraph: r.fromGraph,
              passages: [],
              bestRerankScore: r.rerankScore,
            };
            groupedByItem.set(r.itemId, g);
          }
          if (r.chunkId) {
            g.passages.push({ chunkId: r.chunkId, text: r.text });
          }
        }

        const orderedItemIds = [...groupedByItem.values()]
          .sort((a, b) => b.bestRerankScore - a.bestRerankScore)
          .map((g) => g.itemId);

        // ── Build prompt and stream response ─────────────────────────────────────────
        const { system, userMessage } = buildChatMessages(
          question,
          orderedItemIds
            .map((id) => {
              const item = itemById.get(id);
              const group = groupedByItem.get(id)!;
              if (!item) return null;
              return {
                itemId: item.id,
                title: item.title,
                url: item.url,
                summary: item.summary ?? "",
                tags: tagsByItem.get(item.id) ?? [],
                fromGraph: group.fromGraph,
                passages: group.passages,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        );

        writer.write({ type: "data-status", data: { stage: "writing" }, transient: true });
        const result = streamText({
          model: chatModel,
          system,
          messages: [{ role: "user", content: userMessage }],
          maxOutputTokens: 2048,
          onFinish({ usage }) {
            c.executionCtx.waitUntil(recordUsageEvent(c.env, {
              userId,
              requestId: c.get("requestId"),
              eventType: "chat",
              source: "web",
              model: models.synthesis,
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              metadata: {
                question: question.slice(0, 200),
                seedCount: seedItems.length,
                graphCount: graphItems.length,
                rerankCandidates: rerankInputs.length,
                rerankKept: ranked.length,
                finalItemCount: groupedByItem.size,
              },
            }));
          },
          onError({ error }) {
            log.error({
              event: "chat.stream.failed",
              requestId: c.get("requestId"),
              threadId,
              model: models.synthesis,
              error,
            });
          },
        });

        // Prevent client-disconnect from skipping onFinish — per AI SDK docs,
        // result.consumeStream() (no await) removes backpressure so the stream
        // runs to completion even if the browser tab closes mid-response.
        result.consumeStream();

        // Source links — kept for backward compat with the existing UI.
        for (const id of orderedItemIds) {
          const item = itemById.get(id);
          if (!item) continue;
          writer.write({
            type: "source-url",
            sourceId: item.id,
            url: item.url,
            title: item.title ?? undefined,
          });
        }

        // Passages — one part with the full ordered list. Each entry has a
        // chunkId the model cites as [c:<chunkId>], plus a quote the UI
        // renders inline so the user sees the actual evidence.
        const passagesData = ranked
          .filter((r): r is typeof r & { chunkId: string } => r.chunkId !== null)
          .map((r) => {
            const item = itemById.get(r.itemId);
            return {
              chunkId: r.chunkId,
              itemId: r.itemId,
              url: item?.url ?? "",
              title: item?.title ?? "",
              quote: r.text.length > 240 ? `${r.text.slice(0, 240).trimEnd()}…` : r.text,
              rerankScore: r.rerankScore,
            };
          });
        if (passagesData.length > 0) {
          writer.write({ type: "data-passages", data: { passages: passagesData } });
        }

        // "What I considered" stats — pure presentational, click-to-expand
        // affordance under each assistant bubble in the UI.
        writer.write({
          type: "data-retrieval",
          data: {
            denseCandidates: denseMatches.length,
            ftsCandidates: ftsMatches.length,
            rerankCandidates: rerankInputs.length,
            rerankKept: ranked.length,
            finalItemCount: groupedByItem.size,
            condensed: retrievalQuery !== question ? retrievalQuery : null,
          },
        });

        writer.merge(result.toUIMessageStream({ sendStart: false, onError: onStreamError }));

        // ── Post-stream: follow-ups and (first-turn) thread title.
        // These need the LLM's final text, which `result.text` resolves
        // after the stream completes. Failures are logged — UI degrades
        // gracefully without these.
        try {
          const finalText = await result.text;

          const followupSources = orderedItemIds
            .map((id) => itemById.get(id))
            .filter((x): x is RawItem => !!x)
            .map((it) => ({ title: it.title, url: it.url }));

          await Promise.all([
            (async () => {
              const followups = await generateFollowups(
                c.env.AI,
                question,
                finalText,
                followupSources,
                models.auxiliary
              );

              if (followups.length > 0) {
                writer.write({ type: "data-followups", data: { questions: followups } });
                c.executionCtx.waitUntil(recordUsageEvent(c.env, {
                  userId,
                  requestId: c.get("requestId"),
                  eventType: "followups",
                  source: "web",
                  model: models.auxiliary,
                  metadata: { count: followups.length },
                }));
              }

            })().catch((error) => {
              log.error({
                event: "chat.followups.failed", requestId: c.get("requestId"), threadId,
                model: models.auxiliary, error
              });
            }),
            (async () => {
              // First-turn title: replace the prefix-truncated `deriveTitle`
              // with an LLM-generated 4-6 word title.
              if (priorTurns.length === 0) {
                const title = await generateThreadTitle(
                  c.env.AI,
                  question,
                  finalText,
                  models.auxiliary
                );
                if (title) {
                  await db
                    .update(schema.chatThreads)
                    .set({ title, updatedAt: sql`now()` })
                    .where(eq(schema.chatThreads.id, threadId));
                  writer.write({ type: "data-title", data: { title } });
                  c.executionCtx.waitUntil(recordUsageEvent(c.env, {
                    userId,
                    requestId: c.get("requestId"),
                    eventType: "title",
                    source: "web",
                    model: models.auxiliary,
                    metadata: { threadId },
                  }));
                }
              }
            })().catch((error) => {
              log.error({
                event: "chat.title.failed", requestId: c.get("requestId"), threadId,
                model: models.auxiliary, error
              });
            }),
          ]);
        } catch (err) {
          log.error({
            event: "chat.post_stream.failed",
            requestId: c.get("requestId"),
            threadId,
            model: models.auxiliary,
            error: err,
          });
        }
      },
    }),
    headers: {
      "content-encoding": "identity",
      // Prevent proxies (including Next rewrites) from buffering SSE in gzip.
      "cache-control": "no-cache, no-transform",
      // Surface the resolved thread id to the client — useful when the
      // client didn't supply one and needs to remember which thread this
      // exchange landed in.
      "x-thread-id": threadId,
    },
  });
});

export default app;
