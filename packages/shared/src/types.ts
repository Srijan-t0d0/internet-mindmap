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

export type ViewMode = "cards" | "list" | "graph" | "reading-list";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type SourceType = Item["source_type"];

// AI provider interfaces

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
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
    notes?: string
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
