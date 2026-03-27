import type { TagsAndSummary } from "@internet-mindmap/shared";

export function buildTaggingPrompt(
  title: string,
  content: string,
  sourceType: string
): string {
  const truncated = content.slice(0, 16000);

  return `Analyse this saved web content and return JSON with exactly these fields:
- "tags": array of 3-7 topic tags (lowercase, no hashtags). Be specific (e.g. "react-server-components" not "programming").
- "summary": 2-3 sentence summary of the key ideas.
- "keyPassages": array of 3-5 important quotes or passages from the text (verbatim extracts, not paraphrases). Each under 200 chars.

Source type: ${sourceType}
Title: ${title}

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
When referencing items, mention their title and URL.`,
    userMessage: `My saved items:\n\n${context}\n\nQuestion: ${question}`,
  };
}

export function parseTagsResponse(text: string): TagsAndSummary {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
    const parsed = JSON.parse(cleaned);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      keyPassages: Array.isArray(parsed.keyPassages)
        ? parsed.keyPassages.slice(0, 5)
        : [],
    };
  } catch {
    return { tags: [], summary: text.slice(0, 500), keyPassages: [] };
  }
}
