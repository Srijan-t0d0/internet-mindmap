import type { EmbeddingProvider } from "@internet-mindmap/shared";

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  readonly name = "cloudflare-embeddinggemma";
  readonly dimensions = 768;
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async embed(text: string): Promise<number[]> {
    // Model may not be in CF types yet; cast required
    const result = await (this.ai as any).run("@cf/google/embeddinggemma-300m", {
      text: [text],
    });
    return result.data[0];
  }
}
