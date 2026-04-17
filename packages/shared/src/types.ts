// Domain types

export interface Item {
  id: string;
  url: string;
  title: string;
  source_type: "youtube" | "reddit" | "twitter" | "github" | "hackernews" | "substack" | "blog" | "other";
  summary: string | null;
  key_passages: string[] | null;
  tags: string[];
  status: "pending" | "processing" | "ready" | "error";
  is_read: boolean;
  last_error: string | null;
  author: string | null;
  published: string | null;
  description: string | null;
  site_name: string | null;
  notes: string | null;
  similarity?: number;
  created_at: string;
  updated_at?: string;
}

export interface Tag {
  id: string;
  name: string;
  item_count: number;
}

export type ViewMode = "chat" | "cards" | "list" | "graph" | "reading-list";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SourceType = Item["source_type"];

// AI provider interfaces

/**
 * Supported embedding modalities. Text-only today; image / video_frame will
 * land once we adopt a multimodal provider. A single provider may support
 * multiple modalities (e.g. jina-clip, cohere embed-v4, voyage-multimodal).
 */
export type EmbeddingModality = "text" | "image" | "video_frame";

export interface EmbeddingInput {
  modality: EmbeddingModality;
  /**
   * For modality="text": the raw text to embed.
   * For image / video_frame: an R2 key or public URL. Provider decides how
   * to fetch. Keep content_hash on the caller side so jobs are idempotent.
   */
  content: string;
}

/**
 * Provider contract. Every embedding model (Gemma-768, Gemini-3k, Voyage,
 * Cohere v4, etc.) implements this. The `id` is the migration primary key:
 * every embedding in the database carries this id so we always know which
 * model produced it.
 *
 * Rules:
 *   - `id` is stable forever. Never reuse. Bump `version` instead.
 *   - `dims` is the output length. Must match the destination table's pgvector column.
 *   - All outputs are L2-normalised unit vectors. Cosine is the only metric
 *     we commit to across providers.
 *   - `chunk()` is model-specific. A 2k-token model chunks differently than
 *     an 8k-token model. Storing the chunker id alongside the input lets us
 *     re-chunk when we migrate.
 */
export interface EmbeddingProvider {
  /** Stable unique id, e.g. "gemma-768-v1". Used as a DB foreign key. */
  readonly id: string;
  /** Human-readable name for logs / UI. */
  readonly name: string;
  /** Model version tag. Bump when the underlying model changes, not this code. */
  readonly version: string;
  /** Output dimensionality. */
  readonly dims: number;
  /** What this model can embed. */
  readonly modalities: readonly EmbeddingModality[];
  /** Max input tokens per call (approx, for the chunker). */
  readonly maxTokens: number;
  /** Stable id of the chunker this provider recommends, e.g. "char-6k-500". */
  readonly chunkerId: string;
  /**
   * Destination pgvector table name for this provider's vectors. During the
   * early single-model era this can be the shared `items`/`item_chunks`
   * tables. Once you add a second model with different dims, point its
   * provider at dedicated tables like `item_embeddings_gemini3k_v1`.
   */
  readonly itemTable: string;
  readonly chunkTable: string;

  /**
   * Embed a batch of inputs. Returns unit-normalised vectors in the same order.
   * Implementations should batch internally and throw on any input failure
   * (Cloudflare Workflow step will retry).
   */
  embed(inputs: EmbeddingInput[]): Promise<number[][]>;

  /**
   * Split a long text into chunks sized for this model. Returns [] when the
   * text fits in a single call (caller embeds the whole thing as one input).
   */
  chunkText(text: string): string[];
}

export interface TagsAndSummary {
  betterTitle: string;
  tags: string[];
  summary: string;
  keyPassages: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  generateTagsAndSummary(
    title: string,
    content: string,
    sourceType: string,
    notes?: string,
    existingTags?: string[]
  ): Promise<TagsAndSummary>;
}

// API request/response types are now inferred from Hono route definitions
// via the RPC client. The types below are kept for the browser extension
// which has its own API client and doesn't use Hono RPC.

export interface SaveRequest {
  url: string;
  title: string;
  source_type: string;
  extractedText?: string;
  author?: string;
  published?: string;
  description?: string;
  siteName?: string;
  notes?: string;
}

export interface SaveResponse {
  id: string;
  status: string;
  message: string;
}
