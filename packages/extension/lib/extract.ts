import Defuddle from "defuddle";
import { detectSourceType } from "@internet-mindmap/shared";

const EXTRACT_TIMEOUT_MS = 10_000;

export async function extractContent(): Promise<{
  url: string;
  title: string;
  source_type: string;
  extractedText: string;
  author?: string;
  published?: string;
  description?: string;
  siteName?: string;
}> {
  const url = window.location.href;
  const source_type = detectSourceType(url);
  const fallbackTitle = document.title;

  try {
    const result = await Promise.race([
      new Defuddle(document, { markdown: true }).parseAsync(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), EXTRACT_TIMEOUT_MS)
      ),
    ]);

    return {
      url,
      title: result.title || fallbackTitle,
      source_type,
      extractedText: result.content || "",
      author: result.author || undefined,
      published: result.published || undefined,
      description: result.description || undefined,
      siteName: result.site || undefined,
    };
  } catch {
    return {
      url,
      title: fallbackTitle,
      source_type,
      extractedText: document.body.innerText.slice(0, 50_000),
    };
  }
}
