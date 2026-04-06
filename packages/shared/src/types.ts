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

// API request/response types

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

export interface SearchResponse {
  items: Item[];
  query: string;
  count: number;
}

export interface ItemsResponse {
  items: Item[];
  total: number;
  limit: number;
  offset: number;
}

export interface TagsResponse {
  tags: Tag[];
}

export interface ChatRequest {
  question: string;
}

export interface AgentSearchRequest {
  query: string;
  limit?: number;
  tags?: string[];
}

export interface AgentSearchResponse {
  items: {
    title: string;
    url: string;
    summary: string | null;
    tags: string[];
    similarity_score: number;
  }[];
}

export interface ImportRequest {
  html: string;
}

export interface ImportResponse {
  imported: number;
  skipped: number;
  total_found: number;
  capped: boolean;
  message: string;
}

// ── Usage tracking ─────────────────────────────────────────────────────────

export interface UsageBreakdown {
  event_type: string;
  count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface UsageStats {
  total_events: number;
  total_tokens: number;
  breakdown: UsageBreakdown[];
}
