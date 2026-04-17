import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, sql } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env; Variables: Variables }>().get(
  "/",
  zValidator("query", z.object({ since: z.string().optional() })),
  async (c) => {
    const userId = c.get("userId");
    const { since } = c.req.valid("query");

    const db = getDb(c.env);
    const conditions = [eq(schema.usageEvents.userId, userId)];
    if (since) {
      conditions.push(gte(schema.usageEvents.createdAt, new Date(since)));
    }

    const result = await db
      .select({
        event_type: schema.usageEvents.eventType,
        count: sql<number>`count(*)`,
        input_tokens: sql<number>`coalesce(sum(${schema.usageEvents.inputTokens}), 0)`,
        output_tokens: sql<number>`coalesce(sum(${schema.usageEvents.outputTokens}), 0)`,
        total_tokens: sql<number>`coalesce(sum(${schema.usageEvents.totalTokens}), 0)`,
      })
      .from(schema.usageEvents)
      .where(and(...conditions))
      .groupBy(schema.usageEvents.eventType);

    const breakdown = result.map((row) => ({
      event_type: row.event_type,
      count: Number(row.count),
      input_tokens: Number(row.input_tokens),
      output_tokens: Number(row.output_tokens),
      total_tokens: Number(row.total_tokens),
    }));

    const stats = {
      total_events: breakdown.reduce((sum, b) => sum + b.count, 0),
      total_tokens: breakdown.reduce((sum, b) => sum + b.total_tokens, 0),
      breakdown,
    };

    return c.json(stats, 200);
  }
);

export default app;
