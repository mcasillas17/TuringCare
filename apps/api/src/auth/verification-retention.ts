import { eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { rateLimit } from "../db/schema";

const CURSOR_ID = "verification:maintenance";
const PREFIX_START = "verification:";
// A letter-based prefix successor does not depend on how the DB collation
// orders ':' versus ';'. LIKE narrows this indexed range to our exact prefix.
const PREFIX_END = "verificatioo";
const COUNTER_PATTERN = "^verification:(ip|credential|send):[a-f0-9]{64}$";

export interface VerificationRetentionResult {
  removed: number;
  scanned: number;
  complete: boolean;
  busy: boolean;
}

export class VerificationRetentionIncompleteError extends Error {
  constructor(readonly reason: "busy" | "budget_exhausted") {
    super("Verification retention incomplete");
  }
}

/** Fixed diagnostic vocabulary; never stringify driver errors, SQL, or keys. */
export function verificationRetentionFailure(error: unknown): {
  reason: "busy" | "budget_exhausted" | "timeout" | "database_error" | "unexpected";
  sqlState?: string;
} {
  if (error instanceof VerificationRetentionIncompleteError) return { reason: error.reason };
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = Object.getOwnPropertyDescriptor(current, "code")?.value;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return {
        reason: code === "55P03" ? "busy" : code === "57014" ? "timeout" : "database_error",
        sqlState: code,
      };
    }
    current = Object.getOwnPropertyDescriptor(current, "cause")?.value;
  }
  return { reason: "unexpected" };
}

/**
 * The indexed page bounds candidates. Statement-local tuple IDs also bound the
 * delete's heap visits (an id join can choose a full-table hash/sequence scan).
 * Never persist these tuple IDs; the durable cursor remains the logical id.
 * The expiry predicate is rechecked if a concurrent request renews a tuple.
 */
export function verificationRetentionPage(cursor: string, batchSize: number) {
  return sql`
    with page as materialized (
      select id, ctid from rate_limit
      where id > ${cursor} and id < ${PREFIX_END} and id like 'verification:%'
      order by id limit ${batchSize}
    ), deleted as (
      delete from rate_limit r
      where r.ctid = any(array(select ctid from page))
        and r.key = r.id and r.id ~ ${COUNTER_PATTERN}
        and r.last_request < floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 86400000
      returning r.id
    )
    select (select max(id) from page) as cursor,
      (select count(*)::int from page) as scanned,
      (select count(*)::int from deleted) as removed
  `;
}

/**
 * An existing-table cursor ensures
 * active pages cannot starve later expired counters across bounded invocations.
 * Each indexed page inspects <=500 rows, each run <=50,000; statements have a
 * five-second deadline and lock waits <=1s. Each page commits independently.
 * Ingress takes a bounded queued turn (100 rows); daily maintenance skips a busy
 * cursor and reports incomplete work. Only owned counters older than 24h expire.
 */
export async function purgeVerificationLimits(
  database: DB,
  options: { batchSize?: number; maxBatches?: number; waitForTurn?: boolean } = {},
): Promise<VerificationRetentionResult> {
  const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize ?? 500)));
  const maxBatches = Math.max(1, Math.min(100, Math.floor(options.maxBatches ?? 100)));
  if (!Number.isFinite(batchSize) || !Number.isFinite(maxBatches)) {
    throw new Error("Invalid verification retention budget");
  }
  let removed = 0;
  let scanned = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const pageResult = await database.transaction(
      async (tx): Promise<VerificationRetentionResult> => {
        await tx.execute(sql`set local statement_timeout = '5s'`);
        await tx.execute(sql`set local lock_timeout = '1s'`);
        const lockCursor = () =>
          tx
            .select()
            .from(rateLimit)
            .where(eq(rateLimit.id, CURSOR_ID))
            .for("update", options.waitForTurn ? {} : { skipLocked: true });
        let [marker] = await lockCursor();
        if (!marker) {
          const [exists] = await tx
            .select({ id: rateLimit.id })
            .from(rateLimit)
            .where(eq(rateLimit.id, CURSOR_ID));
          if (exists) return { removed: 0, scanned: 0, complete: false, busy: true };
          await tx
            .insert(rateLimit)
            .values({
              id: CURSOR_ID,
              key: PREFIX_START,
              count: 0,
              lastRequest: 0,
            })
            .onConflictDoNothing();
          [marker] = await lockCursor();
        }
        if (!marker) return { removed: 0, scanned: 0, complete: false, busy: true };
        const cursor =
          marker.key >= PREFIX_START && marker.key < PREFIX_END ? marker.key : PREFIX_START;
        const result = await tx.execute<{
          cursor: string | null;
          scanned: number;
          removed: number;
        }>(verificationRetentionPage(cursor, batchSize));
        const page = result.rows[0];
        if (!page) throw new Error("Verification retention result unavailable");
        const complete = page.scanned < batchSize;
        await tx
          .update(rateLimit)
          .set({ key: complete ? PREFIX_START : (page.cursor ?? PREFIX_START) })
          .where(eq(rateLimit.id, CURSOR_ID));
        return { removed: page.removed, scanned: page.scanned, complete, busy: false };
      },
    );
    removed += pageResult.removed;
    scanned += pageResult.scanned;
    if (pageResult.busy || pageResult.complete) return { ...pageResult, removed, scanned };
  }
  return { removed, scanned, complete: false, busy: false };
}
