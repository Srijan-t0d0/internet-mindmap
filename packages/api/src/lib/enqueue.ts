import type { Env } from "../bindings";
import { createLogger } from "evlog";

export interface ProcessItemParams {
  itemId: string;
  url: string;
  source_type: string;
  userId?: string;
  requestId?: string;
}

/** Log the enqueue boundary once, including failures after an item was saved. */
export async function enqueueItem(env: Pick<Env, "PROCESS_ITEM">, workflowId: string, params: ProcessItemParams): Promise<void> {
  const logger = createLogger({
    event: "workflow.enqueue", requestId: params.requestId,
    workflowId, itemId: params.itemId, sourceType: params.source_type,
  });
  let success = false;
  let error: unknown;
  try {
    await env.PROCESS_ITEM.create({ id: workflowId, params });
    success = true;
  } catch (err) {
    error = err;
    throw err;
  } finally {
    if (!success) logger.error(error instanceof Error ? error : String(error));
    logger.emit({ outcome: success ? "queued" : "error" });
  }
}
