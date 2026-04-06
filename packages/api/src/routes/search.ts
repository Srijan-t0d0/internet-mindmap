import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql, and, inArray } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { createVectorStore } from "../vector-store";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/", async (c) => {
  const query = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
  const sourceType = c.req.query("source_type");
  const tag = c.req.query("tag");
  const userId = c.get("userId");

  if (!query?.trim()) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  if (query.length > 1000) {
    return c.json({ error: "Query too long (max 1000 characters)" }, 400);
  }

  const embedder = new CloudflareEmbeddingProvider(c.env.AI);
  const queryEmbedding = await embedder.embed(query);

  // Search vectors
  const vectors = createVectorStore(c.env);
  const filter: Record<string, string> = {};
  if (sourceType) filter.source_type = sourceType;
  filter.user_id = userId;

  const vectorResults = await vectors.query(queryEmbedding, {
    topK: limit,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  if (vectorResults.matches.length === 0) {
    return c.json({ items: [], query, count: 0 });
  }

  const matchIds = vectorResults.matches.map((m) => m.id);
  const scoreMap = new Map(vectorResults.matches.map((m) => [m.id, m.score]));

  // Fetch items from D1
  const db = drizzle(c.env.DB);
  const matchedItems = await db
    .select()
    .from(schema.items)
    .where(and(inArray(schema.items.id, matchIds), eq(schema.items.userId, userId)));

  // Fetch tags for matched items
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

  // Filter by tag if specified
  let results = matchedItems.map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title,
    source_type: item.sourceType,
    summary: item.summary,
    key_passages: item.keyPassages ? JSON.parse(item.keyPassages) : null,
    tags: (tagsByItem.get(item.id) || [])
      .sort((a, b) => a.position - b.position)
      .map((t) => t.name),
    is_read: item.isRead,
    author: item.author,
    published: item.published,
    description: item.description,
    site_name: item.siteName,
    notes: item.notes,
    similarity: scoreMap.get(item.id) || 0,
    created_at: item.createdAt,
  }));

  if (tag) {
    results = results.filter((r) => r.tags.includes(tag));
  }

  // Sort by similarity desc
  results.sort((a, b) => b.similarity - a.similarity);

  return c.json({ items: results, query, count: results.length });
});

export default app;
