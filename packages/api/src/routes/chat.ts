import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray } from "drizzle-orm";
import type { Env } from "../bindings";
import { auth } from "../middleware/auth";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { CloudflareLLMProvider } from "../ai/llm/cloudflare";
import * as schema from "../db/schema";

const app = new Hono<{ Bindings: Env }>();

app.post("/", auth("extension", "agent"), async (c) => {
  const body = await c.req.json<{ question: string }>();
  const { question } = body;

  if (!question?.trim()) {
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
    return new Response(
      "I don't have any saved items to answer from yet. Save some content first!",
      { headers: { "Content-Type": "text/plain" } }
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

  const llm = new CloudflareLLMProvider(c.env.AI);
  const stream = await llm.chatStream(
    question,
    items.map((i) => ({
      title: i.title,
      url: i.url,
      summary: i.summary || "",
    }))
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
});

export default app;
