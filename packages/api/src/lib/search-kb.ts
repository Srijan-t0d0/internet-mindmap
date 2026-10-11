import { and, desc, eq, gte, inArray, not, or, sql } from "drizzle-orm";
import type { Env } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import { vectorSearchPassages, ftsSearchPassages, rrfFuse, toVectorLiteral, type SearchFilters } from "./vector-search";
import { CHUNK_OVERLAP } from "../ai/embeddings/cloudflare";
import { rerank } from "./rerank";
import { recordUsageEvent, estimateEmbeddingTokens } from "./usage";
import { DEFAULT_MODELS } from "../ai/llm/models";

export type RawItem = { id: string; url: string; title: string; summary: string | null };
type RerankUnit = { text: string; itemId: string; chunkId: string | null; chunkIndex: number | null; fromGraph: boolean };
export type KBPassage = { chunkId: string; chunkIndex: number; text: string; context: string };

// bge-reranker-base returns sigmoid probabilities. Measured: on-topic ≈ 0.3+,
// loosely related ≈ 0.03, unrelated ≈ 0.00004. Anything below this is noise.
const MIN_RERANK_SCORE = 0.01;

// Shared hybrid retrieval. All dense, sparse, hydration and graph queries are owner scoped.
export async function searchKB(env: Env, userId: string, query: string, options: {
  limit?: number;
  onStage?: (stage: "searching" | "ranking") => void;
  waitUntil?: (promise: Promise<unknown>) => void;
  requestId?: string;
  source?: string;
  filters?: SearchFilters;
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
    embedder.embed([{ modality: "text", content: query, kind: "query" }]).then(([embedding]) => {
      usage({ userId, requestId: options.requestId, eventType: "embedding", source: options.source ?? "web",
        model: embedder.id, inputTokens: estimateEmbeddingTokens(query), metadata: { source: "kb-query" } });
      return vectorSearchPassages(db, toVectorLiteral(embedding), 40, userId, options.filters);
    }),
    ftsSearchPassages(db, query, 40, userId, options.filters),
  ]);
  const passageMatches = rrfFuse([denseMatches, ftsMatches], 30);
  const seedIds = [...new Set(passageMatches.map((m) => m.item_id))];
  const projection = { id: schema.items.id, url: schema.items.url, title: schema.items.title, summary: schema.items.summary };
  const [seedItems, seedTagRows] = seedIds.length ? await Promise.all([
    db.select(projection).from(schema.items).where(and(inArray(schema.items.id, seedIds), eq(schema.items.userId, userId))),
    db.select({ itemId: schema.itemTags.itemId, tagId: schema.itemTags.tagId, tagName: schema.tags.name, position: schema.itemTags.position })
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
  // Graph hop on specific tags only: position 0 is the broad domain ("technology"),
  // which pulls in near-random items. Rank neighbours by how many tags they share.
  // Skipped under filters, where an unfiltered hop would leak past them.
  const seedTagIds = [...new Set(seedTagRows.filter((row) => row.position >= 1).map((row) => row.tagId))];
  const graphItems: RawItem[] = seedTagIds.length && !options.filters ? await db.select(projection).from(schema.items)
    .innerJoin(schema.itemTags, eq(schema.itemTags.itemId, schema.items.id))
    .where(and(inArray(schema.itemTags.tagId, seedTagIds), gte(schema.itemTags.position, 1), not(inArray(schema.items.id, seedIds)),
      eq(schema.items.userId, userId), eq(schema.items.status, "ready")))
    .groupBy(schema.items.id).orderBy(desc(sql`count(*)`)).limit(5) : [];
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
      rerankInputs.push({ text: m.text, itemId: m.item_id, chunkId: m.chunk_id, chunkIndex: m.chunk_index, fromGraph: false });
    } else {
      rerankInputs.push({ text: `${item.title}\n\n${item.summary ?? ""}`.trim(), itemId: item.id, chunkId: null, chunkIndex: null, fromGraph: false });
    }
  }
  for (const item of graphItems) {
    rerankInputs.push({ text: `${item.title}\n\n${item.summary ?? ""}`.trim(), itemId: item.id, chunkId: null, chunkIndex: null, fromGraph: true });
  }
  options.onStage?.("ranking");
  const ranked = rerankInputs.length
    ? (await rerank(env.AI, query, rerankInputs, limit)).filter((r) => r.rerankScore >= MIN_RERANK_SCORE) : [];
  usage({ userId, requestId: options.requestId, eventType: "rerank", source: options.source ?? "web",
    model: DEFAULT_MODELS.reranker, metadata: { candidates: rerankInputs.length, kept: ranked.length } });
  const groupedByItem = new Map<string, { itemId: string; fromGraph: boolean; passages: KBPassage[]; bestRerankScore: number }>();
  for (const r of ranked) {
    let group = groupedByItem.get(r.itemId);
    if (!group) {
      group = { itemId: r.itemId, fromGraph: r.fromGraph, passages: [], bestRerankScore: r.rerankScore };
      groupedByItem.set(r.itemId, group);
    }
    if (r.chunkId && r.chunkIndex !== null) group.passages.push({ chunkId: r.chunkId, chunkIndex: r.chunkIndex, text: r.text, context: r.text });
  }
  await expandWithNeighbours(db, userId, [...groupedByItem.values()]);
  const orderedItemIds = [...groupedByItem.values()].sort((a, b) => b.bestRerankScore - a.bestRerankScore).map((g) => g.itemId);
  return { denseMatches, ftsMatches, seedItems, graphItems, rerankInputs, ranked, itemById, tagsByItem, groupedByItem, orderedItemIds };
}

/**
 * Small-to-big: chunks are small so search and rerank are precise; the LLM
 * reads each matched chunk with its neighbours (index ±1). A neighbour is
 * used at most once per item and never when it matched itself, so adjacent
 * hits don't duplicate text. Overlap is trimmed at each seam.
 */
async function expandWithNeighbours(db: ReturnType<typeof getDb>, userId: string,
  groups: { itemId: string; passages: KBPassage[] }[]) {
  const wanted = new Map<string, { itemId: string; index: number }>();
  const plans: { passage: KBPassage; before?: string; after?: string }[] = [];
  for (const group of groups) {
    const used = new Set(group.passages.map((p) => p.chunkIndex));
    for (const passage of group.passages) {
      const plan: (typeof plans)[number] = { passage };
      for (const [side, index] of [["before", passage.chunkIndex - 1], ["after", passage.chunkIndex + 1]] as const) {
        if (index < 0 || used.has(index)) continue;
        used.add(index);
        const key = `${group.itemId}:${index}`;
        wanted.set(key, { itemId: group.itemId, index });
        plan[side] = key;
      }
      plans.push(plan);
    }
  }
  if (wanted.size === 0) return;
  const rows = await db.select({ itemId: schema.itemChunks.itemId, chunkIndex: schema.itemChunks.chunkIndex, text: schema.itemChunks.text })
    .from(schema.itemChunks).innerJoin(schema.items, eq(schema.itemChunks.itemId, schema.items.id))
    .where(and(eq(schema.items.userId, userId), or(...[...wanted.values()].map((w) =>
      and(eq(schema.itemChunks.itemId, w.itemId), eq(schema.itemChunks.chunkIndex, w.index))))));
  const textByKey = new Map(rows.map((row) => [`${row.itemId}:${row.chunkIndex}`, row.text ?? ""]));
  for (const { passage, before, after } of plans) {
    const prev = before ? textByKey.get(before) : undefined;
    const next = after ? textByKey.get(after) : undefined;
    passage.context = (prev ? prev.slice(0, -CHUNK_OVERLAP) : "") + passage.text + (next ? next.slice(CHUNK_OVERLAP) : "");
  }
}
