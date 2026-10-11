const encoder = new TextEncoder();
export function jsonPrefix(value: string, maxBytes: number) {
  let size = 0;
  const parts: string[] = [];
  for (const char of value) {
    size += encoder.encode(JSON.stringify(char).slice(1, -1)).length;
    if (size > maxBytes) break;
    parts.push(char);
  }
  return parts.join("");
}

// Explicit MCP projection; raw vectors and auth/database fields cannot escape.
export function projectMcpItem(item: {
  id: string; title: string; url: string; rawContent: string | null;
  summary: string | null; createdAt: Date; sourceType: string;
}, tags: string[], offset = 0, maxChars = 20_000) {
  if (encoder.encode(JSON.stringify(item.url)).length > 4098) throw new Error("Saved URL is too long for an MCP citation");
  const content = item.rawContent ?? item.summary ?? "";
  // A byte budget bounds even CJK/emoji and escaped delimiters conservatively
  // below client token limits. Pagination still uses original character offsets.
  let size = 0;
  let consumed = 0;
  const parts: string[] = [];
  for (const char of content.slice(offset, offset + maxChars)) {
    const escaped = char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char;
    size += encoder.encode(JSON.stringify(escaped).slice(1, -1)).length;
    if (size > 15_000) break;
    parts.push(escaped);
    consumed += char.length;
  }
  const end = Math.min(content.length, offset + consumed);
  const truncated = end < content.length;
  return { id: item.id, title: jsonPrefix(item.title, 1024), url: item.url,
    text: `<untrusted_saved_content>\n${parts.join("")}\n</untrusted_saved_content>`,
    metadata: { tags: tags.slice(0, 10).map((tag) => jsonPrefix(tag, 64)), summary: item.summary ? jsonPrefix(item.summary, 2000) : null,
      savedAt: item.createdAt.toISOString(), source_type: item.sourceType, truncated, next_offset: truncated ? end : null } };
}
