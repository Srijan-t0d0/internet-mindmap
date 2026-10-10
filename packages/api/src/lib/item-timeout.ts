import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { getDb } from "../db/client";
import { items } from "../db/schema";

/** Expire abandoned attempts before listing or retrying items. */
export async function expireStaleItems(db: ReturnType<typeof getDb>, userId: string, now = new Date()) {
  // ponytail: expire on access; add a scheduled sweep if unattended expiry becomes necessary.
  await db.update(items).set({
    status: "error",
    lastError: "No progress for 1 hour. You can retry this item.",
    errorCount: sql`${items.errorCount} + 1`,
    updatedAt: now,
  }).where(and(
    eq(items.userId, userId),
    inArray(items.status, ["pending", "processing"]),
    lte(items.updatedAt, new Date(now.getTime() - 60 * 60 * 1000)),
  ));
}
