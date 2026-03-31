import type { LLMProvider, TagsAndSummary } from "@internet-mindmap/shared";
import { buildTaggingPrompt, parseTagsResponse } from "./prompts";

const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export class CloudflareLLMProvider implements LLMProvider {
  readonly name = "cloudflare-qwen3-30b-a3b";
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async generateTagsAndSummary(
    title: string,
    content: string,
    sourceType: string
  ): Promise<TagsAndSummary> {
    const prompt = buildTaggingPrompt(title, content, sourceType);

    const result = await (this.ai as any).run(LLM_MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });

    const text = "response" in result ? (result as { response: string }).response : "";
    return parseTagsResponse(text);
  }
}
