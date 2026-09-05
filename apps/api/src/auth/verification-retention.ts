import { eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { rateLimit } from "../db/schema";

const CURSOR_ID = "verification:maintenance";
const PREFIX_START = "verification:";
// A letter-based prefix successor does not depend on how the DB collation
// orders ':' versus ';'. LIKE narrows this indexed range to our exact prefix.
const PREFIX_END = "verificatioo";
const COUNTER_PATTERN = "^verification:(ip|credential|send):[a-f0-9]{64}$";

/**
 * Daily maintenance, never request-path work. An existing-table cursor ensures
 * active pages cannot starve later expired counters across bounded invocations.
 * Each indexed page inspects <=500 rows, each run <=50,000; statements have a
 * five-second deadline. Only owned counters older than 24h are deleted.
 */
export async function purgeVerificationLimits(
  database: DB,
  options: { batchSize?: number; maxBatches?: number } = {},
) {
  const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize ?? 500)));
  const maxBatches = Math.max(1, Math.min(100, Math.floor(options.maxBatches ?? 100)));
  return database.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx
      .insert(rateLimit)
      .values({
        id: CURSOR_ID,
        key: PREFIX_START,
        count: 0,
        lastRequest: 0,
      })
      .onConflictDoNothing();
    const [marker] = await tx
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.id, CURSOR_ID))
      .for("update", { skipLocked: true });
    if (!marker) return { removed: 0, scanned: 0, complete: false, busy: true };
    let cursor = marker.key >= PREFIX_START && marker.key < PREFIX_END ? marker.key : PREFIX_START;
    let removed = 0;
    let scanned = 0;
    let complete = false;
    for (let batch = 0; batch < maxBatches; batch++) {
      const result = await tx.execute<{
        cursor: string | null;
        scanned: number;
        removed: number;
      }>(sql`
        with page as materialized (
          select id from rate_limit
          where id > ${cursor} and id < ${PREFIX_END} and id like 'verification:%'
          order by id limit ${batchSize}
        ), deleted as (
          delete from rate_limit r using page p
          where r.id = p.id and r.key = r.id and r.id ~ ${COUNTER_PATTERN}
            and r.last_request < floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 86400000
          returning r.id
        )
        select (select max(id) from page) as cursor,
          (select count(*)::int from page) as scanned,
          (select count(*)::int from deleted) as removed
      `);
      const page = result.rows[0];
      if (!page) throw new Error("Verification retention result unavailable");
      scanned += page.scanned;
      removed += page.removed;
      cursor = page.cursor ?? PREFIX_START;
      if (page.scanned < batchSize) {
        complete = true;
        cursor = PREFIX_START;
        break;
      }
    }
    await tx.update(rateLimit).set({ key: cursor }).where(eq(rateLimit.id, CURSOR_ID));
    return { removed, scanned, complete, busy: false };
  });
}
