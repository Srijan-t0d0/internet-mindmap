import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { DEFAULT_MODELS } from "../ai/llm/models";

/**
 * Generate a short (4-6 word) thread title from the first user question
 * and the assistant's answer. Replaces the dumb prefix-truncation default
 * (`deriveTitle`) for newly-created threads.
 *
 * Failure-safe: returns null on any error. Caller falls back to
 * `deriveTitle` or whatever the thread already has.
 */

const SYSTEM = `You write 4-6 word titles for chat threads.
- Capture the topic, not the question form.
- No quotes, no trailing punctuation, no "Chat about X".
- Title case (first letter of each word capitalised) unless it's a code identifier.
- Output: just the title. No quotes, no preamble, no explanation.`;

export async function generateThreadTitle(
  ai: Ai,
  question: string,
  answer: string,
  model: string = DEFAULT_MODELS.auxiliary
): Promise<string | null> {
  try {
    const workersai = createWorkersAI({ binding: ai });
    const { text } = await generateText({
      model: workersai(model),
      system: SYSTEM,
      prompt: `/no_think\nQuestion: ${question}\n\nAnswer:\n${answer.slice(0, 800)}\n\nTitle:`,
      maxOutputTokens: 64,
    });
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\.$/, "")
      .trim();
    if (cleaned.length === 0 || cleaned.length > 80) return null;
    return cleaned;
  } catch {
    return null;
  }
}
