import type { Env } from "../../bindings";

/**
 * Central registry of Workers AI model IDs used across the app.
 *
 * Three roles:
 *   - synthesis  — chat answer generation (frontier-scale, 256k ctx)
 *   - auxiliary  — fast utility calls (condense-question, contextualise,
 *                  follow-up suggestions, thread titles, future HyDE-like uses)
 *   - tagging    — structured-output ingest tagging (JSON schema, lower
 *                  hallucination tolerance than chat)
 *
 * Defaults reflect the April 2026 free Workers AI catalogue. Override per
 * deployment via env vars without touching code (see wrangler.toml).
 */
export const DEFAULT_MODELS = {
  synthesis: "@cf/moonshotai/kimi-k2.6",
  auxiliary: "@cf/openai/gpt-oss-20b",
  tagging: "@cf/openai/gpt-oss-20b",
  reranker: "@cf/baai/bge-reranker-base",
} as const;

export type ModelRole = keyof typeof DEFAULT_MODELS;

export function getModels(env: Env) {
  return {
    synthesis: env.LLM_SYNTHESIS || DEFAULT_MODELS.synthesis,
    auxiliary: env.LLM_AUXILIARY || DEFAULT_MODELS.auxiliary,
    tagging: env.LLM_TAGGING || DEFAULT_MODELS.tagging,
    reranker: DEFAULT_MODELS.reranker,
  } as const;
}
