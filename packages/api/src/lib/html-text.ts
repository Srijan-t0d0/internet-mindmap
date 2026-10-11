const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * Saved pages arrive as HTML. Retrieval wants prose: on tweet threads ~70% of
 * the characters were markup, which diluted embeddings, polluted BM25 and
 * spent the reranker's 512-token window on tags. raw_content keeps the HTML
 * for display; this is what gets tagged, chunked and indexed.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/?(br|p|div|h[1-6]|tr|hr|blockquote|pre|ul|ol|article|section|main)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi, (match, name: string | undefined, dec: string | undefined, hex: string | undefined) =>
      name ? ENTITIES[name.toLowerCase()] ?? match : String.fromCodePoint(dec ? Number(dec) : parseInt(hex!, 16)))
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
}
