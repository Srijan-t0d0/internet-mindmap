import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { inArray, and, eq } from "drizzle-orm";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env, Variables } from "../bindings";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { createVectorStore } from "../vector-store";
import { buildChatMessages } from "../ai/llm/prompts";
import { recordUsageEvent, estimateEmbeddingTokens } from "../lib/usage";
import * as schema from "../db/schema";

const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const app = new Hono<{ Bindings: Env; Variables: Variables }>().post("/", async (c) => {
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

  const userId = c.get("userId");

  const embedder = new CloudflareEmbeddingProvider(c.env.AI);
  const queryEmbedding = await embedder.embed(question);

  // Record embedding event (fire-and-forget)
  recordUsageEvent(c.env.DB, {
    userId,
    eventType: "embedding",
    source: "web",
    model: "@cf/baai/bge-base-en-v1.5",
    inputTokens: estimateEmbeddingTokens(question),
    metadata: { source: "chat-query" },
  }).catch(() => {});

  // Find top 5 relevant items
  const vectors = createVectorStore(c.env);
  const vectorResults = await vectors.query(queryEmbedding, { topK: 5, filter: { user_id: userId } });

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
    .where(and(inArray(schema.items.id, matchIds), eq(schema.items.userId, userId)));

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
    onFinish({ usage }) {
      recordUsageEvent(c.env.DB, {
        userId,
        eventType: "chat",
        source: "web",
        model: LLM_MODEL,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        metadata: { question: question.slice(0, 200) },
      }).catch(() => {});
    },
    onError({ error }) {
      console.error("[chat streamText]", error);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "content-encoding": "identity" },
  });
});

export default app;
