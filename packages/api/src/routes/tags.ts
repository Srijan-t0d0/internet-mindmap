import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql, desc } from "drizzle-orm";
import type { Env } from "../bindings";
import { requireAuth } from "../middleware/auth";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env }>();

app.get("/", requireAuth, async (c) => {
  const db = drizzle(c.env.DB);

  const result = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      itemCount: sql<number>`count(${schema.itemTags.itemId})`,
    })
    .from(schema.tags)
    .leftJoin(schema.itemTags, sql`${schema.tags.id} = ${schema.itemTags.tagId}`)
    .groupBy(schema.tags.id)
    .orderBy(desc(sql`count(${schema.itemTags.itemId})`), schema.tags.name);

  return c.json({
    tags: result.map((row) => ({
      id: row.id,
      name: row.name,
      item_count: row.itemCount,
    })),
  });
});

export default app;
