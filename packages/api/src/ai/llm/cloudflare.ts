import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import type { LLMProvider, TagsAndSummary } from "@internet-mindmap/shared";
import { buildTaggingPrompt } from "./prompts";
import { DEFAULT_MODELS } from "./models";

const tagsAndSummarySchema = z.object({
  betterTitle: z.string(),
  tags: z.array(z.string()).min(1).max(7),
  summary: z.string(),
  keyPassages: z.array(z.string()).max(5),
});

export class CloudflareLLMProvider implements LLMProvider {
  readonly name: string;
  private ai: Ai;
  private model: string;

  constructor(ai: Ai, model: string = DEFAULT_MODELS.tagging) {
    this.ai = ai;
    this.model = model;
    this.name = `cloudflare:${model}`;
  }

  async generateTagsAndSummary(
    title: string,
    content: string,
    sourceType: string,
    notes?: string,
    existingTags?: string[]
  ): Promise<TagsAndSummary> {
    const prompt = buildTaggingPrompt(title, content, sourceType, notes, existingTags);
    const workersai = createWorkersAI({ binding: this.ai });

    const { object, usage } = await generateObject({
      model: workersai(this.model),
      schema: tagsAndSummarySchema,
      prompt,
    });

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
