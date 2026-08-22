import { sql } from "drizzle-orm";
import { db } from "../db";

export type BriefLifecycleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockBriefLifecycle(
  tx: Pick<typeof db, "execute">,
  dogId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`brief-lifecycle:${dogId}`}))`,
  );
}

export function withBriefLifecycleLock<T>(
  dogId: string,
  callback: (tx: BriefLifecycleTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockBriefLifecycle(tx, dogId);
    return callback(tx);
  });
}
