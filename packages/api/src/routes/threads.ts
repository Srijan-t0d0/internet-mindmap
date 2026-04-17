import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";

// ── UI message shape ──────────────────────────────────────────────────────
// Rows are stored in AI SDK `UIMessage` shape so they can be handed to
// `useChat({ messages })` unchanged on the client. `parts` and `metadata`
// are jsonb columns, so the Neon driver already gives us parsed JS values.
type UIPart = { type: string; [key: string]: unknown };
type UIMessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: UIPart[];
  metadata?: unknown;
};

function rowToUIMessage(row: {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown;
  metadata: unknown;
}): UIMessageRow {
  const parts = Array.isArray(row.parts) ? (row.parts as UIPart[]) : [];
  const metadata = row.metadata ?? undefined;
  return { id: row.id, role: row.role, parts, ...(metadata ? { metadata } : {}) };
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  // List all threads for the current user (most recently updated first).
  .get("/", async (c) => {
    const db = getDb(c.env);
    const userId = c.get("userId");

    const threads = await db
      .select({
        id: schema.chatThreads.id,
        title: schema.chatThreads.title,
        createdAt: schema.chatThreads.createdAt,
        updatedAt: schema.chatThreads.updatedAt,
      })
      .from(schema.chatThreads)
      .where(eq(schema.chatThreads.userId, userId))
      .orderBy(desc(schema.chatThreads.updatedAt))
      .limit(100);

    return c.json(
      {
        threads: threads.map((t) => ({
          id: t.id,
          title: t.title,
          created_at: t.createdAt.toISOString(),
          updated_at: t.updatedAt.toISOString(),
        })),
      },
      200
    );
  })

  // Get a single thread with its messages (in `UIMessage` shape).
  .get("/:id", async (c) => {
    const db = getDb(c.env);
    const userId = c.get("userId");
    const id = c.req.param("id");

    const [thread] = await db
      .select()
      .from(schema.chatThreads)
      .where(
        and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId))
      )
      .limit(1);

    if (!thread) return c.json({ error: "Thread not found" }, 404);

    const rows = await db
      .select({
        id: schema.chatMessages.id,
        role: schema.chatMessages.role,
        parts: schema.chatMessages.parts,
        metadata: schema.chatMessages.metadata,
      })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.threadId, id))
      .orderBy(asc(schema.chatMessages.createdAt));

    return c.json(
      {
        thread: {
          id: thread.id,
          title: thread.title,
          created_at: thread.createdAt.toISOString(),
          updated_at: thread.updatedAt.toISOString(),
        },
        messages: rows.map(rowToUIMessage),
      },
      200
    );
  })

  // Delete a thread (cascades to chat_messages).
  .delete("/:id", async (c) => {
    const db = getDb(c.env);
    const userId = c.get("userId");
    const id = c.req.param("id");

    const result = await db
      .delete(schema.chatThreads)
      .where(
        and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId))
      )
      .returning({ id: schema.chatThreads.id });

    if (result.length === 0) return c.json({ error: "Thread not found" }, 404);

    return c.json({ ok: true }, 200);
  });

export default app;
