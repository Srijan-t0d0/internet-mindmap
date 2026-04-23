import { Hono } from "hono";
import { inArray, and, eq, not, sql } from "drizzle-orm";
import {
  streamText,
  createUIMessageStreamResponse,
  createUIMessageStream,
  generateId,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
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
import { buildChatMessages } from "../ai/llm/prompts";
import { getModels, DEFAULT_MODELS } from "../ai/llm/models";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
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
  parts?: { type: string; text?: string; [k: string]: unknown }[];
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
  const workersai = createWorkersAI({ binding: c.env.AI });

  // ── Thread id: client-supplied or server-generated ──────────────────────
  // `useChat({ id })` on the client propagates this as `body.id` via
  // DefaultChatTransport. If missing, we mint a new one so the first
  // exchange still gets persisted; the client can read it back if needed.
  const threadId = body.id && typeof body.id === "string" ? body.id : generateId();
  const db = getDb(c.env);

  // Upsert thread row (no-op on conflict except we bump updated_at).
  // Title is set on first insert from the first user message; later turns
  // keep whatever title the thread was created with.
  await db
    .insert(schema.chatThreads)
    .values({
      id: threadId,
      userId,
      title: deriveTitle(question),
    })
    .onConflictDoUpdate({
      target: schema.chatThreads.id,
      set: { updatedAt: sql`now()` },
    });

  // ── Self-RAG: skip retrieval for purely conversational messages ─────────────
  if (isConversational(question)) {
    const result = streamText({
      model: workersai(models.synthesis),
      system: "You are a friendly assistant for a personal knowledge base app. Respond naturally to short conversational messages.",
      messages: [{ role: "user", content: question }],
      maxOutputTokens: 256,
    });
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        async execute({ writer }) {
          await writer.merge(result.toUIMessageStream());
        },
      }),
      headers: { "content-encoding": "identity" },
    });
  }

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
    recordUsageEvent(c.env, {
      userId,
      eventType: "condense",
      source: "web",
      model: models.auxiliary,
      metadata: {
        question: question.slice(0, 200),
        rewritten: retrievalQuery.slice(0, 200),
        priorTurns: priorTurns.length,
      },
    }).catch(() => {});
  }

  // ── Embed the (condensed) query. HyDE was deleted — Anthropic's contextual
  //    retrieval (Step 5) plus the cross-encoder rerank (Step 3) cover the
  //    same recall lift HyDE used to provide on personal-KB domains, without
  //    HyDE's hallucination risk. ────────────────────────────────────────────
  const embedder = buildEmbeddingRegistry(c.env).active();

  const [queryEmbedding] = await embedder.embed([
    { modality: "text", content: retrievalQuery },
  ]);

  recordUsageEvent(c.env, {
    userId,
    eventType: "embedding",
    source: "web",
    model: embedder.id,
    inputTokens: estimateEmbeddingTokens(retrievalQuery),
    metadata: { source: "chat-query" },
  }).catch(() => {});

  const embeddingLiteral = toVectorLiteral(queryEmbedding);

  // ── Hybrid retrieval: dense pgvector + sparse Postgres FTS, fused by RRF.
  //    Each branch returns up to K=20 raw passages; RRF picks the top 20
  //    fused passages for the cross-encoder to rerank. Dense covers
  //    semantic similarity; FTS covers exact-token matches (proper nouns,
  //    code identifiers, error codes) where dense embeddings smear. ─────────
  const [denseMatches, ftsMatches] = await Promise.all([
    vectorSearchPassages(db, embeddingLiteral, 20, userId),
    ftsSearchPassages(db, retrievalQuery, 20, userId),
  ]);

  const passageMatches = rrfFuse([denseMatches, ftsMatches], 20);

  if (passageMatches.length === 0) {
    return c.json({ error: "No saved items found. Save some content first!" }, 404);
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
  const ranked = await rerank(c.env.AI, retrievalQuery, rerankInputs, KEEP_TOP);

  recordUsageEvent(c.env, {
    userId,
    eventType: "rerank",
    source: "web",
    model: DEFAULT_MODELS.reranker,
    metadata: {
      candidates: rerankInputs.length,
      kept: ranked.length,
    },
  }).catch(() => {});

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

  const result = streamText({
    model: workersai(models.synthesis),
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 2048,
    onFinish({ usage }) {
      recordUsageEvent(c.env, {
        userId,
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
      }).catch(() => {});
    },
    onError({ error }) {
      console.error("[chat streamText]", error);
    },
  });

  // Prevent client-disconnect from skipping onFinish — per AI SDK docs,
  // result.consumeStream() (no await) removes backpressure so the stream
  // runs to completion even if the browser tab closes mid-response.
  result.consumeStream();

  // Cast incoming messages to UIMessage[] for the persistence API.
  // `originalMessages` is used by onFinish to return the full merged array.
  const originalMessages = incomingMessages as unknown as UIMessage[];

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages,
      onFinish: async ({ messages: finalMessages }) => {
        // `finalMessages` is the full merged UIMessage[] — prior turns +
        // the newly streamed assistant message. Upsert all rows idempotently
        // so re-sends or retries don't duplicate.
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
                set: {
                  parts: sql`excluded.parts`,
                  metadata: sql`excluded.metadata`,
                },
              });
          }
          // Bump thread updated_at so the sidebar list re-orders.
          await db
            .update(schema.chatThreads)
            .set({ updatedAt: sql`now()` })
            .where(eq(schema.chatThreads.id, threadId));
        } catch (err) {
          console.error("[chat persist]", err);
        }
      },
      async execute({ writer }) {
        // Emit a single `start` part first so sources + text belong to the
        // same assistant message. Without this, writing source-url parts up
        // front and then merging result.toUIMessageStream() (which emits its
        // own start) causes the UI SDK to split them into two messages —
        // resulting in an empty bubble with sources followed by the real
        // response bubble.
        //
        // We also pin a server-generated messageId so the row we persist
        // matches the id the client renders.
        writer.write({ type: "start", messageId: generateId() });
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
        await writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    }),
    headers: {
      "content-encoding": "identity",
      // Surface the resolved thread id to the client — useful when the
      // client didn't supply one and needs to remember which thread this
      // exchange landed in.
      "x-thread-id": threadId,
    },
  });
});

export default app;
