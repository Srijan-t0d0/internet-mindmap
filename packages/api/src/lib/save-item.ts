import { z } from "zod";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { enqueueItem } from "./enqueue";
import { recordUsageEvent } from "./usage";
import type { Env } from "../bindings";

export const saveInput = z.object({
  url: z.url().max(4096).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are supported"),
  title: z.string().min(1).max(2000),
  source_type: z.enum(["youtube", "reddit", "twitter", "github", "hackernews", "substack", "blog", "other"]),
  extractedText: z.string().max(500_000).optional(),
  author: z.string().optional(), published: z.string().optional(), description: z.string().optional(),
  siteName: z.string().optional(), notes: z.string().optional(),
});

export async function saveItem(env: Env, userId: string, input: z.infer<typeof saveInput>, ctx: {
  waitUntil: (task: Promise<unknown>) => void; requestId?: string; source?: string;
}) {
  if (!userId) throw new Error("An owner is required");
  const { url, title, source_type, extractedText, author, published, description, siteName, notes } = saveInput.parse(input);
  const db = getDb(env);
  // Atomic owner+URL upsert, including concurrent saves. Omitted text never erases saved content.
  const [item] = await db.insert(schema.items).values({
    id: crypto.randomUUID(), url, userId, title, sourceType: source_type,
    rawContent: extractedText || null, status: "pending", author: author || null,
    published: published || null, description: description || null, siteName: siteName || null, notes: notes || null,
  }).onConflictDoUpdate({
    target: [schema.items.userId, schema.items.url],
    set: { title, rawContent: extractedText === undefined ? undefined : extractedText || null,
      status: "pending", lastError: null, updatedAt: new Date(),
      author, published, description, siteName, notes },
  }).returning({ id: schema.items.id });
  ctx.waitUntil(recordUsageEvent(env, { userId, requestId: ctx.requestId, eventType: "save",
    source: ctx.source ?? "extension", metadata: { itemId: item.id, url } }));
  await enqueueItem(env, `${item.id}-${crypto.randomUUID()}`, {
    itemId: item.id, url, source_type, userId, requestId: ctx.requestId,
  });
  return { id: item.id, status: "pending" as const, message: "Saved. Processing in background." };
}
