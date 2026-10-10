import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import type { Env } from "../bindings";
import { log } from "evlog";

export interface UsageEvent {
  userId: string;
  requestId?: string;
  workflowId?: string;
  eventType: string;
  source?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Record a best-effort usage event; failures are logged without rejecting.
 * Track background writes with executionCtx.waitUntil(recordUsageEvent(env, event)).
 */
export async function recordUsageEvent(
  env: Pick<Env, "DATABASE_URL">,
  event: UsageEvent
): Promise<void> {
  const inputTokens = event.inputTokens ?? 0;
  const outputTokens = event.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  try {
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
      metadata: event.metadata ?? null,
    });
  } catch (error) {
    log.warn({ event: "usage.record.failed",
      requestId: event.requestId,
      workflowId: event.workflowId,
      threadId: event.metadata?.threadId,
      eventType: event.eventType,
      source: event.source,
      model: event.model,
      itemId: event.metadata?.itemId,
      error,
    });
  }
}

/**
 * Estimate token count for embedding text.
 * EmbeddingGemma uses ~4 chars/token, input capped at 2000 chars.
 */
export function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.slice(0, 2000).length / 4);
}
