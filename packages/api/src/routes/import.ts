import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../bindings";
import { requireAuth } from "../middleware/auth";
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

function detectSourceType(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return "blog";
}

const app = new Hono<{ Bindings: Env }>();

app.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{ html: string }>();
  const { html } = body;

  if (!html) {
    return c.json(
      { error: "html field is required (Chrome bookmarks HTML export)" },
      400
    );
  }

  const bookmarks = parseBookmarksHtml(html);

  if (bookmarks.length === 0) {
    return c.json({ error: "No valid bookmarks found in HTML" }, 400);
  }

  const batch = bookmarks.slice(0, 500);
  const capped = bookmarks.length > 500;

  const db = drizzle(c.env.DB);
  let imported = 0;
  let skipped = 0;

  for (const bookmark of batch) {
    try {
      const existing = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(eq(schema.items.url, bookmark.url))
        .get();

      if (existing) {
        skipped++;
        continue;
      }

      const id = uuidv4();
      const sourceType = detectSourceType(bookmark.url);
      const now = new Date().toISOString();

      await db.insert(schema.items).values({
        id,
        url: bookmark.url,
        title: bookmark.title,
        sourceType,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      await c.env.PROCESS_ITEM.create({
        id,
        params: { itemId: id, url: bookmark.url, source_type: sourceType },
      });

      imported++;
    } catch {
      skipped++;
    }
  }

  return c.json({
    imported,
    skipped,
    total_found: bookmarks.length,
    capped,
    message: capped
      ? `Imported ${imported} bookmarks (capped at 500 per batch). ${bookmarks.length - 500} remaining.`
      : `Imported ${imported} bookmarks. ${skipped} duplicates skipped.`,
  });
});

export default app;
