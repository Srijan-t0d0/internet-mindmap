import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { Env } from "../bindings";
import { auth } from "../middleware/auth";
import { createVectorStore } from "../vector-store";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env }>();

// GET /api/items — list with filters + pagination
app.get("/", auth("extension", "agent"), async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");
  const sourceType = c.req.query("source_type");
  const tag = c.req.query("tag");
  const status = c.req.query("status");
  const isRead = c.req.query("is_read");

  const db = drizzle(c.env.DB);

  // Build conditions
  const conditions = [];
  if (sourceType) conditions.push(eq(schema.items.sourceType, sourceType));
  if (status) conditions.push(eq(schema.items.status, status));
  if (isRead !== null && isRead !== undefined) {
    conditions.push(eq(schema.items.isRead, isRead === "true"));
  }

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
    return c.json({ items: [], total, limit, offset });
  }

  // Fetch tags for items
  const itemIds = itemRows.map((i) => i.id);
  const itemTagRows = await db
    .select({
      itemId: schema.itemTags.itemId,
      tagName: schema.tags.name,
    })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
    .where(inArray(schema.itemTags.itemId, itemIds));

  const tagsByItem = new Map<string, string[]>();
  for (const row of itemTagRows) {
    const existing = tagsByItem.get(row.itemId) || [];
    existing.push(row.tagName);
    tagsByItem.set(row.itemId, existing);
  }

  // Filter by tag in-memory (tag filter requires join logic)
  let items = itemRows.map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title,
    source_type: item.sourceType,
    summary: item.summary,
    key_passages: item.keyPassages ? JSON.parse(item.keyPassages) : null,
    tags: tagsByItem.get(item.id)?.sort() || [],
    status: item.status,
    is_read: item.isRead,
    last_error: item.lastError,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }));

  if (tag) {
    items = items.filter((i) => i.tags.includes(tag));
  }

  return c.json({ items, total, limit, offset });
});

// GET /api/items/:id
app.get("/:id", auth("extension", "agent"), async (c) => {
  const id = c.req.param("id")!;
  const db = drizzle(c.env.DB);

  const item = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.id, id))
    .get();

  if (!item) {
    return c.json({ error: "Item not found" }, 404);
  }

  // Get tags
  const itemTagRows = await db
    .select({ tagName: schema.tags.name, source: schema.itemTags.source })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id))
    .where(eq(schema.itemTags.itemId, id));

  return c.json({
    ...item,
    source_type: item.sourceType,
    key_passages: item.keyPassages ? JSON.parse(item.keyPassages) : null,
    is_read: item.isRead,
    last_error: item.lastError,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    tags: itemTagRows.map((t) => t.tagName).sort(),
  });
});

// PATCH /api/items/:id — update item
app.patch("/:id", auth("extension", "agent"), async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json<{ is_read?: boolean; title?: string }>();
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
    .where(eq(schema.items.id, id))
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
  });
});

// DELETE /api/items/:id
app.delete("/:id", auth("extension", "agent"), async (c) => {
  const id = c.req.param("id")!;
  const db = drizzle(c.env.DB);

  const result = await db
    .delete(schema.items)
    .where(eq(schema.items.id, id))
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

  return c.json({ deleted: true, id });
});

// POST /api/items/:id — retry failed item
app.post("/:id", auth("extension", "agent"), async (c) => {
  const id = c.req.param("id")!;
  const db = drizzle(c.env.DB);

  const item = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.id, id), eq(schema.items.status, "error")))
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

  console.log("[retry] Creating workflow for item:", id);
  const workflowId = `${id}-retry-${Date.now()}`;
  const instance = await c.env.PROCESS_ITEM.create({
    id: workflowId,
    params: { itemId: id, url: item.url, source_type: item.sourceType },
  });
  console.log("[retry] Workflow instance created:", instance.id);

  return c.json({ id, status: "pending", message: "Retry enqueued" });
});

export default app;
