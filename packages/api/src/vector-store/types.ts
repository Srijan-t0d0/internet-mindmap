export interface VectorEntry {
  id: string;
  values: number[];
  metadata?: Record<string, string>;
}

export interface VectorMatch {
  id: string;
  score: number;
}

export interface VectorQueryOptions {
  topK?: number;
  filter?: Record<string, string>;
}

export interface VectorStore {
  upsert(vectors: VectorEntry[]): Promise<{ count: number }>;
  query(vector: number[], options: VectorQueryOptions): Promise<{ matches: VectorMatch[] }>;
  deleteByIds(ids: string[]): Promise<void>;
}
