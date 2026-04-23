import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { DEFAULT_MODELS } from "../ai/llm/models";

/**
 * Anthropic-style "contextual retrieval": for each chunk of a document,
 * generate a 1-2 sentence prefix that situates the chunk inside the parent
 * doc. The prefix is prepended to the chunk text BEFORE embedding (so the
 * vector reflects context-in-context) AND indexed into the FTS column (so
 * BM25 also benefits). Reported lift on Anthropic's eval set: ~49% fewer
 * retrieval failures.
 *
 * Free-tier adaptation: Workers AI has no prompt caching, so per-chunk
 * calls would burn neurons fast. We batch up to BATCH_SIZE chunks per LLM
 * call and ask for a JSON array of prefixes back. The model only sees the
 * doc title + summary + chunk previews — not the full document — which is
 * a quality tradeoff against the original technique but keeps the cost
 * tractable.
 *
 * Eligibility (decided by the caller): chunks.length >= 3 AND total
 * content length >= 4000 chars. Short docs already have implicit context.
 */

const BATCH_SIZE = 5;
const CHUNK_PREVIEW_CHARS = 1200;

const SYSTEM = `You produce contextual prefixes for chunks of a document so each chunk can be retrieved standalone.
For each chunk, write ONE sentence (15-30 words) that:
- Names what the chunk is about and how it fits the parent document.
- Includes any entities, dates, or terms that would make the chunk findable on its own.
- Does NOT repeat the chunk text. Does NOT add information not in the chunk.

Output: JSON array of strings, one per chunk, in input order. Nothing else.`;

export type ContextualizeInput = {
  ai: Ai;
  model?: string;
  title: string;
  summary: string;
  chunks: string[];
};

export async function contextualizeChunks({
  ai,
  model = DEFAULT_MODELS.auxiliary,
  title,
  summary,
  chunks,
}: ContextualizeInput): Promise<string[]> {
  if (chunks.length === 0) return [];

  const prefixes: string[] = new Array(chunks.length).fill("");
  const workersai = createWorkersAI({ binding: ai });

  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const numbered = batch
      .map((c, i) => {
        const preview =
          c.length > CHUNK_PREVIEW_CHARS
            ? `${c.slice(0, CHUNK_PREVIEW_CHARS)}…`
            : c;
        return `[${i}]\n${preview}`;
      })
      .join("\n\n---\n\n");

    const prompt =
      `Document title: ${title}\n` +
      `Document summary: ${summary || "(no summary)"}\n\n` +
      `Chunks (${batch.length}):\n\n${numbered}\n\n` +
      `Return a JSON array of ${batch.length} contextual prefix strings, in order.`;

    try {
      const { text } = await generateText({
        model: workersai(model),
        system: SYSTEM,
        prompt,
        maxOutputTokens: 80 * batch.length + 64,
      });

      const parsed = parsePrefixArray(text, batch.length);
      for (let i = 0; i < batch.length; i++) {
        prefixes[start + i] = parsed[i] ?? "";
      }
    } catch {
      // Non-fatal — leave the prefixes empty for this batch and move on.
      // Embedding still works on the raw chunk; retrieval just won't get
      // the context lift for these chunks.
    }
  }

  return prefixes;
}

function parsePrefixArray(text: string, expected: number): string[] {
  const trimmed = text.trim();
  // Strip optional markdown fence
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, expected).map((s) => (typeof s === "string" ? s.trim() : ""));
    }
  } catch {
    // Try to extract a JSON array embedded in prose
    const match = stripped.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, expected).map((s) =>
            typeof s === "string" ? s.trim() : ""
          );
        }
      } catch {
        // give up, fall through
      }
    }
  }
  return [];
}
