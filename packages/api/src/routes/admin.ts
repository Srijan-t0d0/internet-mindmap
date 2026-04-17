import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";

const BATCH_SIZE = 100;

/**
 * POST /api/admin/reindex
 *
 * Re-triggers ProcessItemWorkflow for every ready item so they are
 * re-embedded and stored in Neon pgvector.
 *
 * Auth: Bearer ${AGENT_API_TOKEN} (inline — no requireAuth middleware on /api/admin)
 */
const app = new Hono<{ Bindings: Env }>().post("/reindex", async (c) => {
  // Manual auth — AGENT_API_TOKEN bearer token only
  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${c.env.AGENT_API_TOKEN}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

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
      await c.env.PROCESS_ITEM.create({
        id: workflowId,
        params: {
          itemId: item.id,
          url: item.url,
          source_type: item.sourceType,
          userId: item.userId ?? undefined,
        },
      });
      queued++;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return c.json({ queued }, 200);
});

export default app;
