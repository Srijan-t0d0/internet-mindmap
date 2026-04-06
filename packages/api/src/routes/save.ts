import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../bindings";
import { requireAuth } from "../middleware/auth";
import { recordUsageEvent } from "../lib/usage";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env }>();

app.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    url: string;
    title: string;
    source_type: string;
    extractedText?: string;
    author?: string;
    published?: string;
    description?: string;
    siteName?: string;
    notes?: string;
  }>();

  const { url, title, source_type, extractedText, author, published, description, siteName, notes } = body;

  if (!url || !title || !source_type) {
    return c.json({ error: "url, title, and source_type are required" }, 400);
  }

  const validTypes = ["youtube", "reddit", "twitter", "github", "hackernews", "substack", "blog", "other"];
  if (!validTypes.includes(source_type)) {
    return c.json(
      { error: `source_type must be one of: ${validTypes.join(", ")}` },
      400
    );
  }

  const db = drizzle(c.env.DB);
  const id = uuidv4();
  const now = new Date().toISOString();

  // Upsert: insert or update on URL conflict
  const existing = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.url, url))
    .get();

  let itemId: string;

  if (existing) {
    itemId = existing.id;
    await db
      .update(schema.items)
      .set({
        title,
        rawContent: extractedText || null,
        status: "pending",
        lastError: null,
        author: author || null,
        published: published || null,
        description: description || null,
        siteName: siteName || null,
        notes: notes || null,
        updatedAt: now,
      })
      .where(eq(schema.items.id, existing.id));
  } else {
    itemId = id;
    await db.insert(schema.items).values({
      id,
      url,
      title,
      sourceType: source_type,
      rawContent: extractedText || null,
      status: "pending",
      author: author || null,
      published: published || null,
      description: description || null,
      siteName: siteName || null,
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const userId = c.get("userId");

  // Record save event (fire-and-forget)
  recordUsageEvent(c.env.DB, {
    userId,
    eventType: "save",
    source: "extension",
    metadata: { itemId, url, isUpdate: !!existing },
  }).catch(() => {});

  // Trigger workflow (use unique instance ID to avoid conflict with prior runs)
  await c.env.PROCESS_ITEM.create({
    id: `${itemId}-${Date.now()}`,
    params: { itemId, url, source_type, userId },
  });

  return c.json(
    { id: itemId, status: "pending", message: "Saved. Processing in background." },
    201
  );
});

export default app;
