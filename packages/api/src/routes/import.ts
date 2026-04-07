import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { SourceType } from "@internet-mindmap/shared";
import type { Env, Variables } from "../bindings";
import * as schema from "../db/schema";

function parseBookmarksHtml(html: string): { url: string; title: string }[] {
  const bookmarks: { url: string; title: string }[] = [];
  const regex = /<DT><A\s+HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim() || url;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      bookmarks.push({ url, title });
    }
  }

  return bookmarks;
}

function detectSourceType(url: string): SourceType {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return "blog";
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  .post(
    "/",
    zValidator("json", z.object({ html: z.string().min(1) })),
    async (c) => {
      const { html } = c.req.valid("json");

      const bookmarks = parseBookmarksHtml(html);

      if (bookmarks.length === 0) {
        return c.json({ error: "No valid bookmarks found in HTML" }, 400);
      }

      const batch = bookmarks.slice(0, 500);
      const capped = bookmarks.length > 500;

      const db = drizzle(c.env.DB);
      const userId = c.get("userId");

      // Batch duplicate check — single query instead of per-bookmark
      const batchUrls = batch.map((b) => b.url);
      const existingRows = await db
        .select({ url: schema.items.url })
        .from(schema.items)
        .where(and(inArray(schema.items.url, batchUrls), eq(schema.items.userId, userId)));
      const existingUrls = new Set(existingRows.map((r) => r.url));

      const newBookmarks = batch.filter((b) => !existingUrls.has(b.url));
      const skipped = batch.length - newBookmarks.length;

      // Batch insert all new items
      if (newBookmarks.length > 0) {
        const now = new Date().toISOString();
        const newItems = newBookmarks.map((bookmark) => ({
          id: uuidv4(),
          url: bookmark.url,
          title: bookmark.title,
          sourceType: detectSourceType(bookmark.url),
          userId,
          status: "pending" as const,
          createdAt: now,
          updatedAt: now,
        }));

        await db.insert(schema.items).values(newItems);

        // Trigger workflows in batches of 50
        const workflowBatches = [];
        for (let i = 0; i < newItems.length; i += 50) {
          const chunk = newItems.slice(i, i + 50);
          workflowBatches.push(
            Promise.all(
              chunk.map((item) =>
                c.env.PROCESS_ITEM.create({
                  id: `${item.id}-${Date.now()}`,
                  params: { itemId: item.id, url: item.url, source_type: item.sourceType, userId },
                })
              )
            )
          );
        }
        await Promise.all(workflowBatches);
      }

      const imported = newBookmarks.length;

      return c.json({
        imported,
        skipped,
        total_found: bookmarks.length,
        capped,
        message: capped
          ? `Imported ${imported} bookmarks (capped at 500 per batch). ${bookmarks.length - 500} remaining.`
          : `Imported ${imported} bookmarks. ${skipped} duplicates skipped.`,
      }, 200);
    }
  );

export default app;
