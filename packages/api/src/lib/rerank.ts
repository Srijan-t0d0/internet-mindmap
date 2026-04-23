import { DEFAULT_MODELS } from "../ai/llm/models";

/**
 * Cross-encoder reranking via Workers AI's bge-reranker-base.
 *
 * Why this exists: dense vector search returns "semantically similar"
 * candidates, but similarity-by-cosine is a noisy signal — many top-K
 * results are barely on-topic. A cross-encoder reads (query, candidate)
 * jointly and outputs a calibrated relevance score, typically lifting
 * retrieval precision 15–30%. This replaces the keyword-overlap "CRAG"
 * scorer that previously sat between vector search and prompt assembly.
 *
 * BGE base has a ~512 token per-pair budget. We truncate context text to
 * ~1500 chars (~375 tokens) to stay comfortably under cap with a normal
 * query. Truncation happens here, not at the call site.
 */

const PER_CONTEXT_CHAR_BUDGET = 1500;

export type RerankCandidate = {
  text: string;
  [key: string]: unknown;
};

export type RerankResult<T extends RerankCandidate> = T & { rerankScore: number };

export async function rerank<T extends RerankCandidate>(
  ai: Ai,
  query: string,
  candidates: T[],
  topK: number = candidates.length
): Promise<RerankResult<T>[]> {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    return [{ ...candidates[0], rerankScore: 1 }];
  }

  const contexts = candidates.map((c) => ({
    text:
      c.text.length > PER_CONTEXT_CHAR_BUDGET
        ? c.text.slice(0, PER_CONTEXT_CHAR_BUDGET)
        : c.text,
  }));

  // The Workers AI type definition for bge-reranker-base omits `query`
  // (the field is documented but missing from the generated TS). Cast
  // through unknown to satisfy the structural check without disabling
  // checks on the rest of the call.
  const out = (await ai.run(
    DEFAULT_MODELS.reranker,
    { query, contexts, top_k: candidates.length } as unknown as {
      contexts: { text?: string }[];
      top_k?: number;
    }
  )) as { response?: { id?: number; score?: number }[] };

  const scores = new Array<number>(candidates.length).fill(0);
  for (const row of out.response ?? []) {
    if (typeof row.id === "number" && typeof row.score === "number") {
      scores[row.id] = row.score;
    }
  }

  return candidates
    .map((c, i) => ({ ...c, rerankScore: scores[i] }) as RerankResult<T>)
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}
