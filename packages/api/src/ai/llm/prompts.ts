import type { TagsAndSummary } from "@internet-mindmap/shared";

export function buildTaggingPrompt(
  title: string,
  content: string,
  sourceType: string,
  notes?: string,
  existingTags?: string[]
): string {
  const truncated = content.slice(0, 16000);

  const notesSection = notes
    ? `\nUser's notes (why they saved this):\n${notes}\n`
    : "";

  const existingTagsSection =
    existingTags && existingTags.length > 0
      ? `\nExisting tags in this knowledge base (reuse these when they fit — consistency helps search and grouping):\n${existingTags.join(", ")}\n`
      : "";

  return `Analyse this saved web content and return JSON with exactly these fields:
- "betterTitle": a concise, descriptive title (under 80 chars). Clean up clickbait, remove site names, fix ALL CAPS, and make it clear what the content is actually about. If the original title is already good, return it as-is.
- "tags": array of 3-7 topic tags in kebab-case (lowercase, hyphens between words, no spaces, no hashtags), ordered from broadest to most specific. The first tag should be the broad domain, then progressively narrower. Examples: ["finance", "investing", "index-funds", "sp500-vs-total-market"] or ["science", "neuroscience", "memory", "spaced-repetition"] or ["design", "typography", "variable-fonts"]. Reuse existing tags from the list below when they fit — only invent new tags if nothing fits. Consider the user's notes when choosing tags.
- "summary": 2-3 sentence summary of the key ideas.
- "keyPassages": array of 3-5 important quotes or passages from the text (verbatim extracts, not paraphrases). Each under 200 chars.

Source type: ${sourceType}
Title: ${title}
${notesSection}${existingTagsSection}
Content:
${truncated}

Return ONLY valid JSON, no markdown fences.`;
}

export type ChatContextItem = {
  itemId: string;
  title: string;
  url: string;
  summary: string;
  tags?: string[];
  fromGraph?: boolean;
  /** Matched passages from this item, in score-descending order. May be empty
   *  when the item was added via the tag-graph hop (no chunk matched). */
  passages?: { chunkId: string; text: string }[];
};

/** Soft cap on total context characters fed to the synthesis LLM. Kimi K2.6
 *  has 256k tokens of headroom, but we still want a tight prompt to keep
 *  latency and noise down. */
const CONTEXT_CHAR_BUDGET = 28000;

export function buildChatMessages(
  question: string,
  items: ChatContextItem[]
): { system: string; userMessage: string } {
  let used = 0;
  const blocks: string[] = [];

  for (const item of items) {
    const header = item.fromGraph
      ? `## "${item.title}" · related via shared topics\nURL: ${item.url}`
      : `## "${item.title}"\nURL: ${item.url}`;
    const tagsLine = item.tags?.length ? `Tags: ${item.tags.join(", ")}` : "";
    const summaryLine = item.summary ? `Summary: ${item.summary}` : "";
    const passageLines = (item.passages ?? []).map(
      (p) => `Passage [c:${p.chunkId}]:\n${p.text}`
    );
    const itemRefHint = item.passages?.length
      ? ""
      : `(No passages matched directly — cite as [i:${item.itemId}] when using this source.)`;

    const block = [header, tagsLine, summaryLine, ...passageLines, itemRefHint]
      .filter(Boolean)
      .join("\n");

    if (used + block.length > CONTEXT_CHAR_BUDGET && blocks.length > 0) break;
    blocks.push(block);
    used += block.length + 2;
  }

  const context = blocks.join("\n\n");

  return {
    system: `You answer from the user's personal knowledge base — articles, pages, and notes they have saved.

Citation rules:
- After every factual claim, cite the most specific source.
- Use [c:<chunk_id>] when the claim is supported by a quoted Passage.
- Use [i:<item_id>] only when the claim is supported by an item's Summary and no Passage covers it.
- Multiple citations are fine: "X is true [c:abc] [c:def]."
- Do not invent citation ids. If the context doesn't support the answer, say so plainly — never fabricate.

Style:
- Synthesise across sources when the answer spans them. Don't just paraphrase one passage.
- Use markdown: **bold** for key points, bullet lists for enumerations, code blocks for code.
- Be concise. Prefer 3 well-cited sentences to 8 hedged ones.
- Items marked "related via shared topics" came in via tag overlap — treat as supporting, not primary.`,
    userMessage: `My saved knowledge base:\n\n${context}\n\nQuestion: ${question}`,
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
