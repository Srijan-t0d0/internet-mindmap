import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { SourceType } from "@internet-mindmap/shared";
import type { Env, Variables } from "../bindings";

const sourceTypes = ["youtube", "reddit", "twitter", "github", "hackernews", "substack", "blog", "other"] as const;
const itemStatuses = ["pending", "processing", "ready", "error"] as const;
import { createVectorStore } from "../vector-store";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  // GET /api/items — list with filters + pagination
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        limit: z.string().optional(),
        offset: z.string().optional(),
        source_type: z.enum(sourceTypes).optional(),
        tag: z.string().optional(),
        status: z.enum(itemStatuses).optional(),
        is_read: z.string().optional(),
      })
    ),
    async (c) => {
      const query = c.req.valid("query");
      const limit = Math.min(parseInt(query.limit || "50"), 500);
      const offset = parseInt(query.offset || "0");
      const sourceType = query.source_type;
      const tag = query.tag;
      const status = query.status;
      const isRead = query.is_read;
      const userId = c.get("userId");

      const db = drizzle(c.env.DB);

      // Build conditions
      const conditions = [];
      conditions.push(eq(schema.items.userId, userId));
      if (sourceType) conditions.push(eq(schema.items.sourceType, sourceType));
      if (status) conditions.push(eq(schema.items.status, status));
      if (isRead !== null && isRead !== undefined) {
        conditions.push(eq(schema.items.isRead, isRead === "true"));
      }

      if (tag) conditions.push(
        inArray(schema.items.id,
          db.select({ id: schema.itemTags.itemId })
            .from(schema.itemTags)
            .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
            .where(eq(schema.tags.name, tag))
        )
      );

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Get items
      const itemRows = await db
        .select()
        .from(schema.items)
        .where(where)
        .orderBy(desc(schema.items.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.items)
        .where(where);
      const total = countResult[0]?.count || 0;

      if (itemRows.length === 0) {
        return c.json({ items: [], total, limit, offset }, 200);
      }

      // Fetch tags for items
      const itemIds = itemRows.map((i) => i.id);
      const itemTagRows = await db
        .select({
          itemId: schema.itemTags.itemId,
          tagName: schema.tags.name,
          position: schema.itemTags.position,
        })
        .from(schema.itemTags)
        .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
        .where(inArray(schema.itemTags.itemId, itemIds));

      const tagsByItem = new Map<string, { name: string; position: number }[]>();
      for (const row of itemTagRows) {
        const existing = tagsByItem.get(row.itemId) || [];
        existing.push({ name: row.tagName, position: row.position });
        tagsByItem.set(row.itemId, existing);
      }

      const items = itemRows.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        source_type: item.sourceType,
        summary: item.summary,
        key_passages: item.keyPassages ? JSON.parse(item.keyPassages) : null,
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
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      }));

      return c.json({ items, total, limit, offset }, 200);
    }
  )
  // GET /api/items/:id
  .get("/:id", async (c) => {
    const id = c.req.param("id")!;
    const userId = c.get("userId");
    const db = drizzle(c.env.DB);

    const item = await db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.userId, userId)))
      .get();

    if (!item) {
      return c.json({ error: "Item not found" }, 404);
    }

    // Get tags ordered by hierarchy (broad → narrow)
    const itemTagRows = await db
      .select({ tagName: schema.tags.name, position: schema.itemTags.position })
      .from(schema.itemTags)
      .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
      .where(eq(schema.itemTags.itemId, id));

    return c.json({
      ...item,
      source_type: item.sourceType,
      key_passages: item.keyPassages ? JSON.parse(item.keyPassages) : null,
      is_read: item.isRead,
      last_error: item.lastError,
      author: item.author,
      published: item.published,
      description: item.description,
      site_name: item.siteName,
      notes: item.notes,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      tags: itemTagRows
        .sort((a, b) => a.position - b.position)
        .map((t) => t.tagName),
    }, 200);
  })
  // PATCH /api/items/:id — update item
  .patch(
    "/:id",
    zValidator(
      "json",
      z.object({
        is_read: z.boolean().optional(),
        title: z.string().optional(),
      })
    ),
    async (c) => {
      const id = c.req.param("id")!;
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const db = drizzle(c.env.DB);

      const updates: Partial<typeof schema.items.$inferInsert> = { updatedAt: new Date().toISOString() };
      if (body.is_read !== undefined) updates.isRead = body.is_read;
      if (body.title !== undefined) updates.title = body.title;

      if (Object.keys(updates).length === 1) {
        return c.json({ error: "No valid fields to update" }, 400);
      }

      const result = await db
        .update(schema.items)
        .set(updates)
        .where(and(eq(schema.items.id, id), eq(schema.items.userId, userId)))
        .returning();

      if (result.length === 0) {
        return c.json({ error: "Item not found" }, 404);
      }

      const item = result[0];
      return c.json({
        id: item.id,
        is_read: item.isRead,
        title: item.title,
        updated_at: item.updatedAt,
      }, 200);
    }
  )
  // DELETE /api/items/:id
  .delete("/:id", async (c) => {
    const id = c.req.param("id")!;
    const userId = c.get("userId");
    const db = drizzle(c.env.DB);

    const result = await db
      .delete(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.userId, userId)))
      .returning({ id: schema.items.id });

    if (result.length === 0) {
      return c.json({ error: "Item not found" }, 404);
    }

    // Delete from vector store to prevent ghost results
    try {
      const vectors = createVectorStore(c.env);
      await vectors.deleteByIds([id]);
    } catch {
      // Vector delete failure is non-fatal
    }

    return c.json({ deleted: true, id }, 200);
  })
  // POST /api/items/:id — retry failed item
  .post("/:id", async (c) => {
    const id = c.req.param("id")!;
    const userId = c.get("userId");
    const db = drizzle(c.env.DB);

    const item = await db
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.id, id), eq(schema.items.status, "error"), eq(schema.items.userId, userId)))
      .get();

    if (!item) {
      return c.json({ error: "Item not found or not in error state" }, 404);
    }

    await db
      .update(schema.items)
      .set({
        status: "pending",
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    const workflowId = `${id}-retry-${Date.now()}`;
    await c.env.PROCESS_ITEM.create({
      id: workflowId,
      params: { itemId: id, url: item.url, source_type: item.sourceType, userId },
    });
    return c.json({ id, status: "pending", message: "Retry enqueued" }, 200);
  });

export default app;
