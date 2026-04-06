import { v4 as uuidv4 } from "uuid";

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
 *   recordUsageEvent(db, event).catch(() => {})
 */
export async function recordUsageEvent(
  db: D1Database,
  event: UsageEvent
): Promise<void> {
  const inputTokens = event.inputTokens ?? 0;
  const outputTokens = event.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  await db
    .prepare(
      `INSERT INTO usage_events (id, user_id, event_type, source, model, input_tokens, output_tokens, total_tokens, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      uuidv4(),
      event.userId,
      event.eventType,
      event.source ?? null,
      event.model ?? null,
      inputTokens,
      outputTokens,
      totalTokens,
      event.metadata ? JSON.stringify(event.metadata) : null
    )
    .run();
}

/**
 * Estimate token count for embedding text.
 * bge-base-en-v1.5 uses ~4 chars/token, input capped at 2000 chars.
 */
export function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.slice(0, 2000).length / 4);
}
