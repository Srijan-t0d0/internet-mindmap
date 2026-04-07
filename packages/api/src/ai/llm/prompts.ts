import type { TagsAndSummary } from "@internet-mindmap/shared";

export function buildTaggingPrompt(
  title: string,
  content: string,
  sourceType: string,
  notes?: string
): string {
  const truncated = content.slice(0, 16000);

  const notesSection = notes
    ? `\nUser's notes (why they saved this):\n${notes}\n`
    : "";

  return `Analyse this saved web content and return JSON with exactly these fields:
- "betterTitle": a concise, descriptive title (under 80 chars). Clean up clickbait, remove site names, fix ALL CAPS, and make it clear what the content is actually about. If the original title is already good, return it as-is.
- "tags": array of 3-7 topic tags (lowercase, no hashtags), ordered from broadest to most specific. The first tag should be the broad domain, then progressively narrower. Examples: ["finance", "investing", "index-funds", "sp500-vs-total-market"] or ["science", "neuroscience", "memory", "spaced-repetition"] or ["design", "typography", "variable-fonts"]. This hierarchy helps the user browse from general to specific. Consider the user's notes when choosing tags — they indicate why this content matters to the user.
- "summary": 2-3 sentence summary of the key ideas.
- "keyPassages": array of 3-5 important quotes or passages from the text (verbatim extracts, not paraphrases). Each under 200 chars.

Source type: ${sourceType}
Title: ${title}
${notesSection}
Content:
${truncated}

Return ONLY valid JSON, no markdown fences.`;
}

export function buildChatMessages(
  question: string,
  items: { title: string; url: string; summary: string }[]
): { system: string; userMessage: string } {
  const context = items
    .map(
      (item, i) =>
        `[${i + 1}] "${item.title}" (${item.url})\nSummary: ${item.summary}`
    )
    .join("\n\n");

  return {
    system: `You are a helpful assistant that answers questions based on the user's saved knowledge base.
Only use the provided context to answer. If the context doesn't contain relevant information, say so.
When citing a source, use bracket references like [1], [2], etc. matching the numbered items provided.
Use markdown formatting in your responses: **bold** for emphasis, bullet lists, code blocks, etc.
Keep answers concise and well-structured.`,
    userMessage: `My saved items:\n\n${context}\n\nQuestion: ${question}`,
  };
}

export function parseTagsResponse(text: string): TagsAndSummary {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
    const parsed = JSON.parse(cleaned);
    return {
      betterTitle: typeof parsed.betterTitle === "string" ? parsed.betterTitle : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      keyPassages: Array.isArray(parsed.keyPassages)
        ? parsed.keyPassages.slice(0, 5)
        : [],
    };
  } catch {
    return { betterTitle: "", tags: [], summary: text.slice(0, 500), keyPassages: [] };
  }
}
