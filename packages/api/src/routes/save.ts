import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, Variables } from "../bindings";
import { recordUsageEvent } from "../lib/usage";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  .post(
    "/",
    zValidator(
      "json",
      z.object({
        url: z.string().min(1),
        title: z.string().min(1),
        source_type: z.enum(["youtube", "reddit", "twitter", "github", "hackernews", "substack", "blog", "other"]),
        extractedText: z.string().optional(),
        author: z.string().optional(),
        published: z.string().optional(),
        description: z.string().optional(),
        siteName: z.string().optional(),
        notes: z.string().optional(),
      })
    ),
    async (c) => {
      const { url, title, source_type, extractedText, author, published, description, siteName, notes } =
        c.req.valid("json");

      const db = drizzle(c.env.DB);
      const id = uuidv4();
      const now = new Date().toISOString();
      const userId = c.get("userId");

      // Upsert: insert or update on URL conflict
      const existing = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(and(eq(schema.items.url, url), eq(schema.items.userId, userId)))
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
          userId,
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
    }
  );

export default app;
