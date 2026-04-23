import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { DEFAULT_MODELS } from "../ai/llm/models";

/**
 * Condense a multi-turn chat into a standalone search query.
 *
 * Why this exists: the chat route only embeds the *latest user message* for
 * retrieval. That breaks follow-ups like "and the second one?" or "what
 * about the React example?" — the embedding has no idea what "the React
 * example" refers to. This function takes recent history + the new question
 * and rewrites it into a self-contained query suitable for embedding and
 * BM25 search.
 *
 * The rewrite is ONLY used for retrieval. The original user message is
 * still what the synthesis LLM sees in the prompt — so the chat reads
 * naturally even when the rewrite is awkward.
 *
 * Cheap: one ~64-token Workers AI call on the auxiliary model. Skipped on
 * the first turn (no prior context to resolve against).
 */

const SYSTEM = `You rewrite the user's latest message into a STANDALONE search query for a knowledge base.
- Resolve pronouns and references using the prior turns.
- Keep nouns, entities, and intent. Drop greetings and small talk.
- Output ONLY the rewritten query. No quotes, no preamble, no explanation.
- If the user's message is already standalone, return it unchanged.`;

export type CondenseTurn = {
  role: "user" | "assistant";
  text: string;
};

const HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;

export async function condenseQuery(
  ai: Ai,
  history: CondenseTurn[],
  latestUserMessage: string,
  model: string = DEFAULT_MODELS.auxiliary
): Promise<string> {
  // First turn — nothing to resolve against.
  if (history.length === 0) return latestUserMessage;

  const recent = history.slice(-HISTORY_TURNS);
  const transcript = recent
    .map((t) => {
      const truncated =
        t.text.length > MAX_TURN_CHARS
          ? `${t.text.slice(0, MAX_TURN_CHARS)}…`
          : t.text;
      return `${t.role === "user" ? "User" : "Assistant"}: ${truncated}`;
    })
    .join("\n");

  const prompt = `${transcript}\nUser: ${latestUserMessage}\n\nRewritten standalone query:`;

  try {
    const workersai = createWorkersAI({ binding: ai });
    const { text } = await generateText({
      model: workersai(model),
      system: SYSTEM,
      prompt,
      maxOutputTokens: 96,
    });
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^Rewritten[^:]*:\s*/i, "")
      .trim();
    return cleaned.length > 0 ? cleaned : latestUserMessage;
  } catch {
    // Non-fatal — fall back to the raw message rather than failing the chat.
    return latestUserMessage;
  }
}
