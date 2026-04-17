import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { buildEmbeddingRegistry } from "../ai/embeddings/registry";
import { vectorSearch, toVectorLiteral } from "../lib/vector-search";
import * as schema from "../db/schema";

// Agent keeps unscoped access — it uses userId="agent" (not a real user).
// This is intentional: AI agents search across all saved knowledge.
const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  .post(
    "/search",
    zValidator(
      "json",
      z.object({
        query: z.string(),
        limit: z.number().optional(),
        tags: z.array(z.string()).optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");

      const { query, tags: filterTags } = body;
      const limit = Math.min(body.limit || 10, 50);

      if (!query?.trim()) {
        return c.json({ error: "query is required" }, 400);
      }

      const embedder = buildEmbeddingRegistry(c.env).active();
      const [queryEmbedding] = await embedder.embed([
        { modality: "text", content: query },
      ]);
      const embeddingLiteral = toVectorLiteral(queryEmbedding);

      const db = getDb(c.env);

      // Global search — no userId filter (intentional: agent searches all users)
      const matches = await vectorSearch(db, embeddingLiteral, limit);

      if (matches.length === 0) {
        return c.json({ items: [] }, 200);
      }

      const matchIds = matches.map((m) => m.item_id);
      const scoreMap = new Map(matches.map((m) => [m.item_id, m.score]));

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
        similarity_score: scoreMap.get(item.id) ?? 0,
      }));

      // Filter by tags if specified
      if (filterTags && filterTags.length > 0) {
        results = results.filter((r) =>
          filterTags.some((ft) => r.tags.includes(ft))
        );
      }

      results.sort((a, b) => b.similarity_score - a.similarity_score);

      return c.json({ items: results }, 200);
    }
  );

export default app;
