import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import type { Env } from "../bindings";

export interface UsageEvent {
  userId: string;
  eventType: string;
  source?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Record a usage event. Always call fire-and-forget:
 *   recordUsageEvent(env, event).catch(() => {})
 */
export async function recordUsageEvent(
  env: Pick<Env, "DATABASE_URL">,
  event: UsageEvent
): Promise<void> {
  const inputTokens = event.inputTokens ?? 0;
  const outputTokens = event.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  const db = getDb(env);
  await db.insert(schema.usageEvents).values({
    id: uuidv4(),
    userId: event.userId,
    eventType: event.eventType,
    source: event.source ?? null,
    model: event.model ?? null,
    inputTokens,
    outputTokens,
    totalTokens,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  });
}

/**
 * Estimate token count for embedding text.
 * EmbeddingGemma uses ~4 chars/token, input capped at 2000 chars.
 */
export function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.slice(0, 2000).length / 4);
}
