import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import * as schema from "../db/schema";
import { CloudflareEmbeddingProvider } from "../ai/embeddings/cloudflare";
import { CloudflareLLMProvider } from "../ai/llm/cloudflare";
import { fetchYouTubeTranscript } from "../lib/youtube";
import type { Env } from "../bindings";

interface ProcessItemParams {
  itemId: string;
  url: string;
  source_type: string;
}

export class ProcessItemWorkflow extends WorkflowEntrypoint<Env, ProcessItemParams> {
  async run(event: WorkflowEvent<ProcessItemParams>, step: WorkflowStep) {
    const { itemId, url, source_type } = event.payload;
    const env = this.env;
    const db = drizzle(env.DB);

    try {
      // Step 1: Mark as processing
      await step.do("update-status", async () => {
        await db
          .update(schema.items)
          .set({ status: "processing", updatedAt: new Date().toISOString() })
          .where(eq(schema.items.id, itemId));
      });

      // Step 2: Fetch content
      const content = await step.do("fetch-content", async () => {
        const item = await db
          .select({ rawContent: schema.items.rawContent, title: schema.items.title })
          .from(schema.items)
          .where(eq(schema.items.id, itemId))
          .get();

        if (!item) throw new Error(`Item ${itemId} not found`);

        let text = item.rawContent || "";

        // For YouTube, fetch transcript if no content
        if (source_type === "youtube" && !text) {
          const transcript = await fetchYouTubeTranscript(url);
          if (transcript) {
            text = transcript;
            // Store the transcript
            await db
              .update(schema.items)
              .set({ rawContent: text.slice(0, 200_000), updatedAt: new Date().toISOString() })
              .where(eq(schema.items.id, itemId));
          }
        }

        return { content: text, title: item.title };
      });

      // Step 3: Generate embedding
      const embedding = await step.do("generate-embedding", async () => {
        const embedder = new CloudflareEmbeddingProvider(env.AI);
        const textToEmbed = content.content || content.title;
        return await embedder.embed(textToEmbed);
      });

      // Step 4: Generate tags + summary (skip if no content beyond title)
      const llmResult = await step.do("generate-tags", async () => {
        if (!content.content) {
          return { tags: [], summary: "No content could be extracted.", keyPassages: [] };
        }

        const llm = new CloudflareLLMProvider(env.AI);
        return await llm.generateTagsAndSummary(
          content.title,
          content.content,
          source_type
        );
      });

      // Step 5: Store results
      await step.do("store-results", async () => {
        // Upsert to Vectorize
        const tagNames = llmResult.tags.slice(0, 7);
        await env.VECTORIZE.upsert([
          {
            id: itemId,
            values: embedding,
            metadata: {
              title: content.title,
              source_type,
              tags: tagNames.join(","),
            },
          },
        ]);

        // Update item in D1
        await db
          .update(schema.items)
          .set({
            summary: llmResult.summary,
            keyPassages: JSON.stringify(llmResult.keyPassages),
            vectorizeId: itemId,
            status: "ready",
            lastError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, itemId));

        // Upsert tags
        for (const tagName of tagNames) {
          const normalised = tagName.toLowerCase().trim();
          if (!normalised) continue;

          // Check if tag exists
          let tagRow = await db
            .select({ id: schema.tags.id })
            .from(schema.tags)
            .where(eq(schema.tags.name, normalised))
            .get();

          if (!tagRow) {
            const tagId = uuidv4();
            await db.insert(schema.tags).values({ id: tagId, name: normalised });
            tagRow = { id: tagId };
          }

          // Link tag to item (ignore if exists)
          try {
            await db.insert(schema.itemTags).values({
              itemId,
              tagId: tagRow.id,
              source: "auto",
            });
          } catch {
            // Duplicate — already linked
          }
        }
      });
    } catch (err) {
      // Record the error and increment error_count
      await step.do("mark-error", async () => {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.items)
          .set({
            status: "error",
            lastError: message,
            errorCount: sql`error_count + 1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.items.id, itemId));
      });
      throw err;
    }
  }
}
