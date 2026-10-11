import type {
  EmbeddingInput,
  EmbeddingModality,
  EmbeddingProvider,
} from "@internet-mindmap/shared";

/**
 * EmbeddingGemma-300m via Workers AI.
 *
 *   - 768-dim output, Matryoshka-truncatable but we keep native.
 *   - ~2048 token context ⇒ ~8000 chars safe truncation.
 *   - Text-only.
 *
 * This provider's `id` is the migration key. Every row in `embedding_jobs`
 * that references `gemma-768-v1` was produced by *this exact code path*.
 * If the underlying model changes, bump `version` and change the id —
 * do NOT silently swap the bytes.
 */

const CHAR_BUDGET_PER_INPUT = 8000;

// Chunker params. Stored alongside embedding_inputs so a later model with a
// bigger context window can decide to re-chunk without re-scraping.
// 1500 chars (~375 tokens) keeps each chunk inside bge-reranker-base's
// 512-token window, so the reranker scores the whole chunk, not its head.
const CHUNK_SIZE = 1500;
export const CHUNK_OVERLAP = 200;
// Workers AI caps texts per embedding call.
const MAX_BATCH = 50;
const CHUNKER_ID = `char-${CHUNK_SIZE}-${CHUNK_OVERLAP}`;

function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0 || !Number.isFinite(norm)) return v;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  // v2: 1500-char chunks + EmbeddingGemma task prompts. v1 vectors are not
  // comparable with v2 queries, so every item must be re-embedded.
  readonly id = "gemma-768-v2";
  readonly name = "cloudflare-embeddinggemma-300m";
  readonly version = "2";
  readonly dims = 768;
  readonly modalities: readonly EmbeddingModality[] = ["text"];
  readonly maxTokens = 2048;
  readonly chunkerId = CHUNKER_ID;
  // Single-model era: reuse the existing pgvector columns on items / item_chunks.
  // When a second provider with different dims joins, point IT at new tables;
  // this one stays here.
  readonly itemTable = "items";
  readonly chunkTable = "item_chunks";

  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async embed(inputs: EmbeddingInput[]): Promise<number[][]> {
    if (inputs.length === 0) return [];

    for (const input of inputs) {
      if (input.modality !== "text") {
        throw new Error(
          `CloudflareEmbeddingProvider only supports text, got ${input.modality}`
        );
      }
    }

    // EmbeddingGemma is trained with asymmetric task prompts (model card).
    const texts = inputs.map((i) => {
      const prompt = i.kind === "query"
        ? "task: search result | query: "
        : `title: ${i.title?.replace(/\s+/g, " ").trim() || "none"} | text: `;
      return (prompt + i.content).slice(0, CHAR_BUDGET_PER_INPUT);
    });

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const result = (await this.ai.run("@cf/google/embeddinggemma-300m", {
        text: texts.slice(i, i + MAX_BATCH),
      })) as { data: number[][] };
      // Normalize every vector. Every provider commits to unit-length cosine.
      vectors.push(...result.data.map(l2Normalize));
    }
    return vectors;
  }

  chunkText(text: string): string[] {
    // Short docs used to return `[]`, which meant no item_chunks rows and
    // therefore no FTS/BM25 coverage or passage-strip render — short items
    // were only findable via the doc-level items.embedding vector. Treat
    // non-empty short docs as a single chunk so hybrid retrieval and the
    // chat UI's per-passage affordances work uniformly.
    if (text.length === 0) return [];
    if (text.length <= CHUNK_SIZE) return [text];
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
      if (i + CHUNK_SIZE >= text.length) break;
      i += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
  }
}
