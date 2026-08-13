import { sql } from "drizzle-orm";
import type { db } from "../db";

/** Serializes safety writes before any more granular training locks are acquired. */
export async function lockDogSafety(tx: Pick<typeof db, "execute">, dogId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dog-safety:${dogId}`}))`);
}
