export interface Env {
  DB: D1Database;
  VECTORIZE?: VectorizeIndex;
  AI: Ai;
  PROCESS_ITEM: Workflow;
  EXTENSION_API_TOKEN: string;
  AGENT_API_TOKEN: string;
  VECTOR_PROVIDER?: string; // "d1" | "vectorize" | "upstash" — defaults to "d1"
}
