import { Hono } from "hono";
import { inArray, and, eq, not } from "drizzle-orm";
import { streamText, createUIMessageStreamResponse, createUIMessageStream } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import { vectorSearch, toVectorLiteral } from "../lib/vector-search";
import { generateHypotheticalAnswer, HYDE_MODEL } from "../lib/hyde";
import { buildChatMessages } from "../ai/llm/prompts";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
import * as schema from "../db/schema";

const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

// ── Self-RAG: detect purely conversational messages that don't need retrieval ──
const CONVERSATIONAL_RE =
  /^(hi|hello|hey|thanks|thank you|ok|okay|got it|cool|great|sure|yes|no|bye|goodbye|sounds good|makes sense|awesome|perfect|nice|lol|😊|👋)\W*$/i;

function isConversational(text: string): boolean {
  return text.length < 40 && CONVERSATIONAL_RE.test(text.trim());
}

// ── CRAG: stop-word list for query term extraction ────────────────────────────
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "to", "of", "in", "on", "at",
  "by", "for", "with", "from", "this", "that", "it", "its", "what", "how",
  "why", "when", "where", "who", "me", "my", "about", "tell", "show",
  "find", "get", "all", "any", "some", "more", "also", "just", "not",
  "and", "or", "but", "if", "so", "then", "than", "like", "did", "know",
]);

function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreRelevance(
  queryTerms: string[],
  item: { title: string; summary: string | null }
): number {
  if (queryTerms.length === 0) return 1;
  const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const hits = queryTerms.filter((t) => haystack.includes(t));
  return hits.length / queryTerms.length;
}

function rewriteQuery(query: string): string {
  const terms = extractQueryTerms(query);
  return terms.length > 0 ? terms.join(" ") : query;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type RawItem = {
  id: string;
  url: string;
  title: string;
  summary: string | null;
};

type ScoredItem = RawItem & {
  tags: string[];
  fromGraph: boolean;
  relevance: number;
};

// ── Hono route ────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Env; Variables: Variables }>().post("/", async (c) => {
  const body = await c.req.json<{
    messages?: { role: string; content: string; parts?: { type: string; text?: string }[] }[];
  }>();

  const lastUserMsg = [...(body.messages || [])].reverse().find((m) => m.role === "user");
  const question = (
    lastUserMsg?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ||
    lastUserMsg?.content ||
    ""
  ).trim();

  if (!question) return c.json({ error: "question is required" }, 400);
  if (question.length > 1000) return c.json({ error: "Question too long (max 1000 characters)" }, 400);

  const userId = c.get("userId");
  const workersai = createWorkersAI({ binding: c.env.AI });

  // ── Self-RAG: skip retrieval for purely conversational messages ─────────────
  if (isConversational(question)) {
    const result = streamText({
      model: workersai(LLM_MODEL),
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

  // ── HyDE: embed a hypothetical answer instead of the raw question ───────────
  const embedder = buildEmbeddingRegistry(c.env).active();

  let textToEmbed = question;
  try {
    textToEmbed = (await generateHypotheticalAnswer(c.env.AI, question)) || question;
    recordUsageEvent(c.env, {
      userId,
      eventType: "hyde",
      source: "web",
      model: HYDE_MODEL,
      metadata: { question: question.slice(0, 200) },
    }).catch(() => {});
  } catch {
    // Non-fatal — fall back to embedding the raw question
  }

  const [queryEmbedding] = await embedder.embed([
    { modality: "text", content: textToEmbed },
  ]);

  recordUsageEvent(c.env, {
    userId,
    eventType: "embedding",
    source: "web",
    model: "@cf/google/embeddinggemma-300m",
    inputTokens: estimateEmbeddingTokens(textToEmbed),
    metadata: { source: "chat-query" },
  }).catch(() => {});

  const embeddingLiteral = toVectorLiteral(queryEmbedding);
  const db = getDb(c.env);

  // ── pgvector UNION search — topK=8 to give CRAG more candidates ─────────────
  const matches = await vectorSearch(db, embeddingLiteral, 8, userId);

  if (matches.length === 0) {
    return c.json({ error: "No saved items found. Save some content first!" }, 404);
  }

  const seedIds = matches.map((m) => m.item_id);

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

  // ── CRAG: score and filter retrieved items ──────────────────────────────────
  const queryTerms = extractQueryTerms(question);
  const RELEVANCE_THRESHOLD = 0.15;

  const seen = new Set<string>();

  function scoreAndTag(item: RawItem, fromGraph: boolean): ScoredItem {
    return {
      ...item,
      tags: tagsByItem.get(item.id) ?? [],
      fromGraph,
      relevance: scoreRelevance(queryTerms, item),
    };
  }

  const allItems: ScoredItem[] = [];
  for (const item of [...seedItems.map((i) => scoreAndTag(i, false)), ...graphItems.map((i) => scoreAndTag(i, true))]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      allItems.push(item);
    }
  }

  let relevantItems = allItems.filter((i) => i.relevance >= RELEVANCE_THRESHOLD);

  // ── CRAG retry: if fewer than 2 items are relevant, rewrite and re-search once
  let cragRetried = false;
  if (relevantItems.length < 2) {
    const rewritten = rewriteQuery(question);
    if (rewritten !== question && rewritten.length > 0) {
      cragRetried = true;
      const [retryEmbedding] = await embedder.embed([
        { modality: "text", content: rewritten },
      ]);
      const retryLiteral = toVectorLiteral(retryEmbedding);
      const retryMatches = await vectorSearch(db, retryLiteral, 5, userId);

      const retryIds = retryMatches.map((m) => m.item_id).filter((id) => !seen.has(id));
      if (retryIds.length > 0) {
        const retryItems = await db
          .select({
            id: schema.items.id,
            url: schema.items.url,
            title: schema.items.title,
            summary: schema.items.summary,
          })
          .from(schema.items)
          .where(and(inArray(schema.items.id, retryIds), eq(schema.items.userId, userId)));

        for (const item of retryItems) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            allItems.push(scoreAndTag(item, false));
          }
        }
        relevantItems = allItems.filter((i) => i.relevance >= RELEVANCE_THRESHOLD);
      }
    }
  }

  const finalItems = relevantItems.length > 0 ? relevantItems : allItems;

  finalItems.sort((a, b) => {
    if (a.fromGraph !== b.fromGraph) return a.fromGraph ? 1 : -1;
    return b.relevance - a.relevance;
  });

  const contextItems = finalItems.slice(0, 10);

  // ── Build prompt and stream response ─────────────────────────────────────────
  const { system, userMessage } = buildChatMessages(
    question,
    contextItems.map((i) => ({
      title: i.title,
      url: i.url,
      summary: i.summary ?? "",
      tags: i.tags,
      fromGraph: i.fromGraph,
    }))
  );

  const result = streamText({
    model: workersai(LLM_MODEL),
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 2048,
    onFinish({ usage }) {
      recordUsageEvent(c.env, {
        userId,
        eventType: "chat",
        source: "web",
        model: LLM_MODEL,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        metadata: {
          question: question.slice(0, 200),
          seedCount: seedItems.length,
          graphCount: graphItems.length,
          finalCount: contextItems.length,
          cragRetried,
        },
      }).catch(() => {});
    },
    onError({ error }) {
      console.error("[chat streamText]", error);
    },
  });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        for (const item of contextItems) {
          writer.write({
            type: "source-url",
            sourceId: item.id,
            url: item.url,
            title: item.title ?? undefined,
          });
        }
        await writer.merge(result.toUIMessageStream());
      },
    }),
    headers: { "content-encoding": "identity" },
  });
});

export default app;
