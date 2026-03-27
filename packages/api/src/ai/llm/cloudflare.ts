import type { LLMProvider, TagsAndSummary } from "@internet-mindmap/shared";
import { buildTaggingPrompt, buildChatMessages, parseTagsResponse } from "./prompts";

// Model may not be in CF types yet
const LLM_MODEL = "@cf/moonshotai/kimi-k2.5";

export class CloudflareLLMProvider implements LLMProvider {
  readonly name = "cloudflare-kimi-k2.5";
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

  async chatStream(
    question: string,
    items: { title: string; url: string; summary: string }[]
  ): Promise<ReadableStream> {
    const { system, userMessage } = buildChatMessages(question, items);

    const stream = await (this.ai as any).run(LLM_MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      max_tokens: 2048,
      stream: true,
    });

    // Workers AI streaming returns an SSE stream. Transform to plain text.
    return new ReadableStream({
      async start(controller) {
        const reader = (stream as ReadableStream).getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            // Parse SSE: lines like "data: {\"response\":\"...\"}"
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.response) {
                    controller.enqueue(new TextEncoder().encode(parsed.response));
                  }
                } catch {
                  // Skip malformed SSE chunks
                }
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });
  }
}
