import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import type { LLMProvider, TagsAndSummary } from "@internet-mindmap/shared";
import { buildTaggingPrompt } from "./prompts";

const LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const tagsAndSummarySchema = z.object({
  betterTitle: z.string(),
  tags: z.array(z.string()).min(1).max(7),
  summary: z.string(),
  keyPassages: z.array(z.string()).max(5),
});

export class CloudflareLLMProvider implements LLMProvider {
  readonly name = "cloudflare-qwen3-30b-a3b";
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async generateTagsAndSummary(
    title: string,
    content: string,
    sourceType: string,
    notes?: string
  ): Promise<TagsAndSummary> {
    const prompt = buildTaggingPrompt(title, content, sourceType, notes);
    const workersai = createWorkersAI({ binding: this.ai });

    const { object, usage } = await generateObject({
      model: workersai(LLM_MODEL),
      schema: tagsAndSummarySchema,
      prompt,
    });

    console.log("[llm] generated tags:", object.tags, "summary length:", object.summary.length);

    return {
      betterTitle: object.betterTitle,
      tags: object.tags.slice(0, 7),
      summary: object.summary,
      keyPassages: object.keyPassages.slice(0, 5),
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    };
  }
}
