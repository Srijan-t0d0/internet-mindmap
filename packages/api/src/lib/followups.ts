import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { DEFAULT_MODELS } from "../ai/llm/models";

/**
 * Generate 3 follow-up question suggestions grounded in the just-streamed
 * answer + the retrieved sources. Cheap auxiliary call so the cost is one
 * extra model call per assistant turn.
 *
 * Failure mode: returns [] on any error (parse, network, LLM refusal).
 * The chat continues normally without follow-ups.
 */

const SYSTEM = `You suggest 3 short follow-up questions a user might ask next, grounded in the answer they just received and the sources cited.
- Each question must be a natural extension of the conversation, not a repeat.
- Phrase each as the USER would type it (first person, no "you should ask").
- Keep each under 70 characters.
- Output: JSON array of exactly 3 strings. Nothing else.`;

export type FollowupSource = { title: string; url: string };

export async function generateFollowups(
  ai: Ai,
  question: string,
  answer: string,
  sources: FollowupSource[],
  model: string = DEFAULT_MODELS.auxiliary
): Promise<string[]> {
  if (!answer.trim()) return [];

  const sourceList = sources
    .slice(0, 6)
    .map((s, i) => `[${i + 1}] ${s.title}`)
    .join("\n");

  const prompt =
    `Question: ${question}\n\n` +
    `Answer (just delivered):\n${answer.slice(0, 2000)}\n\n` +
    `Sources cited:\n${sourceList || "(none)"}\n\n` +
    `Suggest 3 follow-up questions as a JSON array.`;

  try {
    const workersai = createWorkersAI({ binding: ai });
    const { text } = await generateText({
      model: workersai(model),
      system: SYSTEM,
      prompt,
      maxOutputTokens: 200,
    });

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = (() => {
      try {
        return JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (!match) return null;
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
    })();

    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 3);
  } catch {
    return [];
  }
}
