import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export const HYDE_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

/**
 * HyDE (Hypothetical Document Embeddings): generate a short hypothetical answer
 * to the user's question and return it for embedding instead of the raw question.
 *
 * This bridges the vocabulary gap between short questions and longer stored
 * summaries, improving retrieval quality at the cost of one extra LLM call.
 *
 * Used in /api/chat only — search stays direct for latency.
 */
export async function generateHypotheticalAnswer(ai: Ai, question: string): Promise<string> {
  const workersai = createWorkersAI({ binding: ai });
  const { text } = await generateText({
    model: workersai(HYDE_MODEL),
    prompt: `Write 2-3 sentences that would directly answer this question. Be specific and use relevant terminology:\n\n${question}`,
    maxOutputTokens: 120,
  });
  return text.trim();
}
