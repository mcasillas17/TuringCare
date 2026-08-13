import { sql } from "drizzle-orm";
import { db } from "../db";

/** The Drizzle executor handed to a callback running inside a database transaction. */
export type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes safety writes before any more granular training locks are acquired. */
export async function lockDogSafety(tx: Pick<typeof db, "execute">, dogId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dog-safety:${dogId}`}))`);
}

/**
 * Runs `callback` inside a transaction that holds the dog-scoped safety lock
 * for its entire duration, so every writer of a safety input (signals, journal
 * entries) is serialized against every safety decision for the same dog.
 */
export async function withDogSafetyLock<T>(
  dogId: string,
  callback: (tx: TransactionType) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    return await callback(tx);
  });
}
