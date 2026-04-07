import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env, Variables } from "../bindings";

const app = new Hono<{ Bindings: Env; Variables: Variables }>().get(
  "/",
  zValidator("query", z.object({ since: z.string().optional() })),
  async (c) => {
    const userId = c.get("userId");
    const { since } = c.req.valid("query");

    let query = `
    SELECT event_type,
           COUNT(*) as count,
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(total_tokens), 0) as total_tokens
    FROM usage_events
    WHERE user_id = ?
  `;
    const params: unknown[] = [userId];

    if (since) {
      query += ` AND created_at >= ?`;
      params.push(since);
    }

    query += ` GROUP BY event_type`;

    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all<{
        event_type: string;
        count: number;
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      }>();

    const breakdown = (result.results ?? []).map((row) => ({
      event_type: row.event_type,
      count: row.count,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      total_tokens: row.total_tokens,
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
