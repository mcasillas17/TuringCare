import { lt } from "drizzle-orm";
import type { DB } from "../db";
import { events } from "../db/schema";

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

/** Deletes events older than `retentionDays`. Returns the row count removed. */
export async function purgeOldEvents(
  database: DB,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = retentionCutoff(now, retentionDays);
  const removed = await database
    .delete(events)
    .where(lt(events.createdAt, cutoff))
    .returning({ id: events.id });
  return removed.length;
}
