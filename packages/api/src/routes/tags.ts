import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { sql, desc, eq } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const userId = c.get("userId");

  const result = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      itemCount: sql<number>`count(${schema.itemTags.itemId})`,
    })
    .from(schema.tags)
    .innerJoin(schema.itemTags, eq(schema.tags.id, schema.itemTags.tagId))
    .innerJoin(schema.items, eq(schema.itemTags.itemId, schema.items.id))
    .where(eq(schema.items.userId, userId))
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
