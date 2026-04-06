import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { createVectorStore } from "../vector-store";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Agent keeps unscoped access — it uses userId="agent" (not a real user).
// This is intentional: AI agents search across all saved knowledge.
app.post("/search", async (c) => {
  const body = await c.req.json<{
    query: string;
    limit?: number;
    tags?: string[];
  }>();

  const { query, tags: filterTags } = body;
  const limit = Math.min(body.limit || 10, 50);

  if (!query?.trim()) {
    return c.json({ error: "query is required" }, 400);
  }

  const embedder = new CloudflareEmbeddingProvider(c.env.AI);
  const queryEmbedding = await embedder.embed(query);

  const vectors = createVectorStore(c.env);
  const vectorResults = await vectors.query(queryEmbedding, { topK: limit });

  if (vectorResults.matches.length === 0) {
    return c.json({ items: [] });
  }

  const matchIds = vectorResults.matches.map((m) => m.id);
  const scoreMap = new Map(vectorResults.matches.map((m) => [m.id, m.score]));

  const db = drizzle(c.env.DB);
  const items = await db
    .select()
    .from(schema.items)
    .where(inArray(schema.items.id, matchIds));

  // Get tags for items
  const itemTagRows = await db
    .select({
      itemId: schema.itemTags.itemId,
      tagName: schema.tags.name,
      position: schema.itemTags.position,
    })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
    .where(inArray(schema.itemTags.itemId, matchIds));

  const tagsByItem = new Map<string, { name: string; position: number }[]>();
  for (const row of itemTagRows) {
    const existing = tagsByItem.get(row.itemId) || [];
    existing.push({ name: row.tagName, position: row.position });
    tagsByItem.set(row.itemId, existing);
  }

  let results = items.map((item) => ({
    title: item.title,
    url: item.url,
    summary: item.summary,
    tags: (tagsByItem.get(item.id) || [])
      .sort((a, b) => a.position - b.position)
      .map((t) => t.name),
    similarity_score: scoreMap.get(item.id) || 0,
  }));

  // Filter by tags if specified
  if (filterTags && filterTags.length > 0) {
    results = results.filter((r) =>
      filterTags.some((ft) => r.tags.includes(ft))
    );
  }

  results.sort((a, b) => b.similarity_score - a.similarity_score);

  return c.json({ items: results });
});

export default app;
