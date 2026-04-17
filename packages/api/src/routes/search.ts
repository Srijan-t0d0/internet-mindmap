import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import { vectorSearch, toVectorLiteral } from "../lib/vector-search";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        q: z.string(),
        limit: z.string().optional(),
        source_type: z.string().optional(),
        tag: z.string().optional(),
      })
    ),
    async (c) => {
      const { q: query, limit: limitStr, source_type: sourceType, tag } = c.req.valid("query");
      const limit = Math.min(parseInt(limitStr || "20"), 50);
      const userId = c.get("userId");

      if (!query?.trim()) {
        return c.json({ error: "Query parameter 'q' is required" }, 400);
      }

      if (query.length > 1000) {
        return c.json({ error: "Query too long (max 1000 characters)" }, 400);
      }

      // Query is embedded by the ACTIVE provider — the one that owns the
      // vectors currently in items.embedding / item_chunks.embedding.
      // During a migration (shadow provider writing to its own tables),
      // this would fan out across providers and merge results. One model today.
      const registry = buildEmbeddingRegistry(c.env);
      const embedder = registry.active();
      const [queryEmbedding] = await embedder.embed([
        { modality: "text", content: query },
      ]);
      const embeddingLiteral = toVectorLiteral(queryEmbedding);

      const db = getDb(c.env);

      // pgvector UNION search: doc-level + chunk-level, dedup by MAX(score)
      const matches = await vectorSearch(db, embeddingLiteral, limit, userId);

      if (matches.length === 0) {
        return c.json({ items: [], query, count: 0 }, 200);
      }

      const matchIds = matches.map((m) => m.item_id);
      const scoreMap = new Map(matches.map((m) => [m.item_id, m.score]));

      // Fetch items from Neon
      let itemConditions = [
        inArray(schema.items.id, matchIds),
        eq(schema.items.userId, userId),
      ] as ReturnType<typeof eq>[];

      if (sourceType) {
        itemConditions.push(eq(schema.items.sourceType, sourceType as typeof schema.items.$inferSelect.sourceType));
      }

      const matchedItems = await db
        .select()
        .from(schema.items)
        .where(and(...itemConditions));

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

      let results = matchedItems.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        source_type: item.sourceType,
        summary: item.summary,
        key_passages: item.keyPassages ?? null,
        tags: (tagsByItem.get(item.id) || [])
          .sort((a, b) => a.position - b.position)
          .map((t) => t.name),
        status: item.status,
        is_read: item.isRead,
        last_error: item.lastError,
        author: item.author,
        published: item.published,
        description: item.description,
        site_name: item.siteName,
        notes: item.notes,
        similarity: scoreMap.get(item.id) ?? 0,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      }));

      if (tag) {
        results = results.filter((r) => r.tags.includes(tag));
      }

      results.sort((a, b) => b.similarity - a.similarity);

      return c.json({ items: results, query, count: results.length }, 200);
    }
  );

export default app;
