import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { inArray } from "drizzle-orm";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../bindings";
import { auth } from "../middleware/auth";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { createVectorStore } from "../vector-store";
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

  console.log("[chat] question:", question);

  const embedder = new CloudflareEmbeddingProvider(c.env.AI);
  const queryEmbedding = await embedder.embed(question);
  console.log("[chat] embedding generated, dimensions:", queryEmbedding.length);

  // Find top 5 relevant items
  const vectors = createVectorStore(c.env);
  const vectorResults = await vectors.query(queryEmbedding, { topK: 5 });
  console.log("[chat] vector search returned", vectorResults.matches.length, "matches");

  if (vectorResults.matches.length === 0) {
    return c.json(
      { error: "No saved items found. Save some content first!" },
      404
    );
  }

  const matchIds = vectorResults.matches.map((m) => m.id);
  console.log("[chat] fetching items from D1, ids:", matchIds);
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
  console.log("[chat] fetched", items.length, "items from D1:", items.map((i) => i.title));

  const { system, userMessage } = buildChatMessages(
    question,
    items.map((i) => ({
      title: i.title,
      url: i.url,
      summary: i.summary || "",
    }))
  );
  console.log("[chat] built prompt, system length:", system.length, "user message length:", userMessage.length);

  const workersai = createWorkersAI({ binding: c.env.AI });
  console.log("[chat] streaming LLM response with model:", LLM_MODEL);
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
