import { and, eq, inArray, not } from "drizzle-orm";
import type { Env } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import { vectorSearchPassages, ftsSearchPassages, rrfFuse, toVectorLiteral } from "./vector-search";
import { rerank } from "./rerank";
import { recordUsageEvent, estimateEmbeddingTokens } from "./usage";
import { DEFAULT_MODELS } from "../ai/llm/models";

export type RawItem = { id: string; url: string; title: string; summary: string | null };
type RerankUnit = { text: string; itemId: string; chunkId: string | null; fromGraph: boolean };

// Shared hybrid retrieval. All dense, sparse, hydration and graph queries are owner scoped.
export async function searchKB(env: Env, userId: string, query: string, options: {
  limit?: number;
  onStage?: (stage: "searching" | "ranking") => void;
  waitUntil?: (promise: Promise<unknown>) => void;
  requestId?: string;
  source?: string;
} = {}) {
  if (!userId) throw new Error("An owner is required");
  const limit = Math.min(20, Math.max(1, options.limit ?? 6));
  const db = getDb(env);
  const embedder = buildEmbeddingRegistry(env).active();
  const usage = (event: Parameters<typeof recordUsageEvent>[1]) => {
    const task = recordUsageEvent(env, event);
    if (options.waitUntil) options.waitUntil(task);
    else void task.catch(() => {});
  };
  options.onStage?.("searching");
  const [denseMatches, ftsMatches] = await Promise.all([
    embedder.embed([{ modality: "text", content: query }]).then(([embedding]) => {
      usage({ userId, requestId: options.requestId, eventType: "embedding", source: options.source ?? "web",
        model: embedder.id, inputTokens: estimateEmbeddingTokens(query), metadata: { source: "kb-query" } });
      return vectorSearchPassages(db, toVectorLiteral(embedding), 20, userId);
    }),
    ftsSearchPassages(db, query, 20, userId),
  ]);
  const passageMatches = rrfFuse([denseMatches, ftsMatches], 20);
  const seedIds = [...new Set(passageMatches.map((m) => m.item_id))];
  const projection = { id: schema.items.id, url: schema.items.url, title: schema.items.title, summary: schema.items.summary };
  const [seedItems, seedTagRows] = seedIds.length ? await Promise.all([
    db.select(projection).from(schema.items).where(and(inArray(schema.items.id, seedIds), eq(schema.items.userId, userId))),
    db.select({ itemId: schema.itemTags.itemId, tagId: schema.itemTags.tagId, tagName: schema.tags.name })
      .from(schema.itemTags).innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
      .innerJoin(schema.items, eq(schema.itemTags.itemId, schema.items.id))
      .where(and(inArray(schema.itemTags.itemId, seedIds), eq(schema.items.userId, userId))),
  ]) : [[], []];
  const tagsByItem = new Map<string, string[]>();
  for (const row of seedTagRows) {
    const names = tagsByItem.get(row.itemId) ?? [];
    names.push(row.tagName);
    tagsByItem.set(row.itemId, names);
  }
  const seedTagIds = [...new Set(seedTagRows.map((row) => row.tagId))];
  const graphItems: RawItem[] = seedTagIds.length ? await db.selectDistinct(projection).from(schema.items)
    .innerJoin(schema.itemTags, eq(schema.itemTags.itemId, schema.items.id))
    .where(and(inArray(schema.itemTags.tagId, seedTagIds), not(inArray(schema.items.id, seedIds)),
      eq(schema.items.userId, userId), eq(schema.items.status, "ready"))).limit(8) : [];
  const itemById = new Map<string, RawItem>([...seedItems, ...graphItems].map((item) => [item.id, item]));
  const rerankInputs: RerankUnit[] = [];
  const seenChunkIds = new Set<string>();
  for (const m of passageMatches) {
    // Defense in depth: hydration must have confirmed the owner before exposing a passage.
    const item = itemById.get(m.item_id);
    if (!item) continue;
    if (m.chunk_id && m.text) {
      if (seenChunkIds.has(m.chunk_id)) continue;
      seenChunkIds.add(m.chunk_id);
      rerankInputs.push({ text: m.text, itemId: m.item_id, chunkId: m.chunk_id, fromGraph: false });
    } else {
      rerankInputs.push({ text: `${item.title}\n\n${item.summary ?? ""}`.trim(), itemId: item.id, chunkId: null, fromGraph: false });
    }
  }
  for (const item of graphItems) {
    rerankInputs.push({ text: `${item.title}\n\n${item.summary ?? ""}`.trim(), itemId: item.id, chunkId: null, fromGraph: true });
  }
  options.onStage?.("ranking");
  const ranked = rerankInputs.length ? await rerank(env.AI, query, rerankInputs, limit) : [];
  usage({ userId, requestId: options.requestId, eventType: "rerank", source: options.source ?? "web",
    model: DEFAULT_MODELS.reranker, metadata: { candidates: rerankInputs.length, kept: ranked.length } });
  const groupedByItem = new Map<string, { itemId: string; fromGraph: boolean; passages: { chunkId: string; text: string }[]; bestRerankScore: number }>();
  for (const r of ranked) {
    let group = groupedByItem.get(r.itemId);
    if (!group) {
      group = { itemId: r.itemId, fromGraph: r.fromGraph, passages: [], bestRerankScore: r.rerankScore };
      groupedByItem.set(r.itemId, group);
    }
    if (r.chunkId) group.passages.push({ chunkId: r.chunkId, text: r.text });
  }
  const orderedItemIds = [...groupedByItem.values()].sort((a, b) => b.bestRerankScore - a.bestRerankScore).map((g) => g.itemId);
  return { denseMatches, ftsMatches, seedItems, graphItems, rerankInputs, ranked, itemById, tagsByItem, groupedByItem, orderedItemIds };
}
