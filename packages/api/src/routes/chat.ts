import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { inArray } from "drizzle-orm";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../bindings";
import { auth } from "../middleware/auth";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { buildChatMessages } from "../ai/llm/prompts";
import * as schema from "../db/schema";

const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const app = new Hono<{ Bindings: Env }>();

app.post("/", auth("extension", "agent"), async (c) => {
  const body = await c.req.json<{ messages?: { role: string; content: string; parts?: { type: string; text?: string }[] }[] }>();

  // AI SDK v6 sends { messages } with parts array — extract the last user message text
  const lastUserMsg = [...(body.messages || [])].reverse().find((m) => m.role === "user");
  const question = (
    lastUserMsg?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ||
    lastUserMsg?.content ||
    ""
  ).trim();

  if (!question) {
    return c.json({ error: "question is required" }, 400);
  }

  if (question.length > 1000) {
    return c.json({ error: "Question too long (max 1000 characters)" }, 400);
  }

  const embedder = new CloudflareEmbeddingProvider(c.env.AI);
  const queryEmbedding = await embedder.embed(question);

  // Find top 5 relevant items via Vectorize
  const vectorResults = await c.env.VECTORIZE.query(queryEmbedding, { topK: 5 });

  if (vectorResults.matches.length === 0) {
    return c.json(
      { error: "No saved items found. Save some content first!" },
      404
    );
  }

  const matchIds = vectorResults.matches.map((m) => m.id);
  const db = drizzle(c.env.DB);

  const items = await db
    .select({
      id: schema.items.id,
      url: schema.items.url,
      title: schema.items.title,
      summary: schema.items.summary,
    })
    .from(schema.items)
    .where(inArray(schema.items.id, matchIds));

  const { system, userMessage } = buildChatMessages(
    question,
    items.map((i) => ({
      title: i.title,
      url: i.url,
      summary: i.summary || "",
    }))
  );

  const workersai = createWorkersAI({ binding: c.env.AI });
  const result = streamText({
    model: workersai(LLM_MODEL),
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 2048,
    onError({ error }) {
      console.error("[chat streamText]", error);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "content-encoding": "identity" },
  });
});

export default app;
