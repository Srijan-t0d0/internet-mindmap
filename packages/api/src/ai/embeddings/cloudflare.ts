import type { EmbeddingProvider } from "@internet-mindmap/shared";

/** bge-base-en-v1.5 has a 512 token window; ~2000 chars ≈ 512 tokens */
const MAX_EMBED_CHARS = 2000;

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  readonly name = "cloudflare-bge-base";
  readonly dimensions = 768;
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async embed(text: string): Promise<number[]> {
    const truncated = text.slice(0, MAX_EMBED_CHARS);
    const result = (await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [truncated],
    })) as { data: number[][] };
    return result.data[0];
  }
}
