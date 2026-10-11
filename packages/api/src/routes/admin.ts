import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { validAdminToken } from "../lib/admin-auth";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import { enqueueItem } from "../lib/enqueue";
import * as schema from "../db/schema";

const BATCH_SIZE = 100;

/**
 * POST /api/admin/reindex
 *
 * Re-triggers ProcessItemWorkflow for every ready item so they are
 * re-embedded and stored in Neon pgvector. Embed-only: titles, summaries
 * and tags (including user edits) are kept.
 *
 * Auth: Bearer ${AGENT_API_TOKEN} (inline — no requireAuth middleware on /api/admin)
 */
const app = new Hono<{ Bindings: Env; Variables: Variables }>()
.use("*", async (c, next) => {
  if (!await validAdminToken(c.req.header("Authorization"), c.env.AGENT_API_TOKEN)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
})
.post("/items/:id/retry", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  // Ownership comes from the database, never from an impersonation header.
  const [item] = await db.select().from(schema.items).where(eq(schema.items.id, id));
  if (!item) return c.json({ error: "Item not found" }, 404);
  const [claimed] = await db.update(schema.items)
    .set({ status: "pending", lastError: null, updatedAt: new Date() })
    .where(and(eq(schema.items.id, id), eq(schema.items.updatedAt, item.updatedAt)))
    .returning({ id: schema.items.id });
  if (!claimed) return c.json({ error: "Item has changed" }, 409);
  await enqueueItem(c.env, `${id}-admin-${Date.now()}`, {
    itemId: id, url: item.url, source_type: item.sourceType,
    userId: item.userId ?? undefined, requestId: c.get("requestId"),
  });
  return c.json({ id, status: "pending" });
})
.post("/reindex", async (c) => {
  const db = getDb(c.env);
  let queued = 0;

  // Always query from offset=0 — as each batch is set to "pending" the next
  // query naturally picks up the following batch of "ready" items.
  while (true) {
    const batch = await db
      .select({
        id: schema.items.id,
        url: schema.items.url,
        sourceType: schema.items.sourceType,
        userId: schema.items.userId,
      })
      .from(schema.items)
      .where(eq(schema.items.status, "ready"))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    for (const item of batch) {
      await db
        .update(schema.items)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(schema.items.id, item.id));

      const workflowId = `reindex-${item.id}-${Date.now()}`;
      await enqueueItem(c.env, workflowId, {
        itemId: item.id,
        url: item.url,
        source_type: item.sourceType,
        userId: item.userId ?? undefined,
        requestId: c.get("requestId"),
        reembedOnly: true,
      });
      queued++;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return c.json({ queued }, 200);
});

export default app;
