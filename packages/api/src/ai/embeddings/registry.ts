import type { EmbeddingProvider } from "@internet-mindmap/shared";
import type { Env } from "../../bindings";
import { CloudflareEmbeddingProvider } from "./cloudflare";

/**
 * Embedding provider registry.
 *
 * One place to answer:
 *   - Which provider embeds new saves? (active + shadow)
 *   - Which provider embeds search queries? (active)
 *   - What providers has this deployment ever known?
 *
 * Config via env:
 *   EMBEDDING_ACTIVE   — provider id whose vectors win at query time
 *                        (default: "gemma-768-v1")
 *   EMBEDDING_SHADOW   — comma-separated provider ids to ALSO embed on save,
 *                        without affecting query time. Use this to build a
 *                        parallel corpus with a new model, then flip
 *                        EMBEDDING_ACTIVE once backfill is complete.
 *                        (default: "")
 *
 * To introduce a new model:
 *   1. Implement EmbeddingProvider in a new file.
 *   2. Register it in `build()` below.
 *   3. Deploy with EMBEDDING_SHADOW="<new-id>". New saves now double-embed.
 *   4. Run a backfill worker over `embedding_inputs` for old items.
 *   5. Flip EMBEDDING_ACTIVE="<new-id>". Query time switches.
 *   6. (Later) Drop EMBEDDING_SHADOW, delete old provider's vectors.
 *
 * No code change during the flip. No user-visible downtime.
 */

export class EmbeddingRegistry {
  private readonly providers = new Map<string, EmbeddingProvider>();
  private readonly activeId: string;
  private readonly shadowIds: readonly string[];

  constructor(providers: EmbeddingProvider[], activeId: string, shadowIds: string[]) {
    for (const p of providers) {
      if (this.providers.has(p.id)) {
        throw new Error(`Duplicate embedding provider id: ${p.id}`);
      }
      this.providers.set(p.id, p);
    }
    if (!this.providers.has(activeId)) {
      throw new Error(
        `Active embedding provider "${activeId}" not registered. ` +
          `Known: ${[...this.providers.keys()].join(", ")}`
      );
    }
    for (const id of shadowIds) {
      if (!this.providers.has(id)) {
        throw new Error(`Shadow embedding provider "${id}" not registered`);
      }
    }
    this.activeId = activeId;
    this.shadowIds = shadowIds;
  }

  /** Provider used for search queries. */
  active(): EmbeddingProvider {
    return this.providers.get(this.activeId)!;
  }

  /** Providers that should embed on every save (active + shadow). */
  writers(): EmbeddingProvider[] {
    const ids = new Set<string>([this.activeId, ...this.shadowIds]);
    return [...ids].map((id) => this.providers.get(id)!);
  }

  /** Lookup by id — used by the backfill worker. */
  get(id: string): EmbeddingProvider | undefined {
    return this.providers.get(id);
  }

  /** All known providers, for admin / health endpoints. */
  all(): EmbeddingProvider[] {
    return [...this.providers.values()];
  }
}

/**
 * Build the registry from env + bindings. Call this once per request.
 * Providers are cheap to construct (they just wrap the AI binding), so
 * there's no need to cache across requests in a Worker.
 */
export function buildEmbeddingRegistry(env: Env): EmbeddingRegistry {
  const providers: EmbeddingProvider[] = [
    new CloudflareEmbeddingProvider(env.AI),
    // Register future providers here:
    //   new GeminiEmbeddingProvider(env.GEMINI_API_KEY),
    //   new VoyageMultimodalProvider(env.VOYAGE_API_KEY),
  ];

  const activeId = env.EMBEDDING_ACTIVE || "gemma-768-v1";
  const shadowIds =
    (env.EMBEDDING_SHADOW || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  return new EmbeddingRegistry(providers, activeId, shadowIds);
}
