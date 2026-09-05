import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db, pool } from "../db";
import { rateLimit } from "../db/schema";
import { waitForBlockingChain } from "../test-pg-concurrency";
import { purgeVerificationLimits } from "./verification-retention";

const ids: string[] = [];
afterEach(async () => {
  if (ids.length) await db.delete(rateLimit).where(inArray(rateLimit.id, ids.splice(0)));
});

async function seed(age: number, native = false) {
  const id = native
    ? `native-retention-${randomUUID()}`
    : `verification:credential:${"0".repeat(32)}${randomUUID().replaceAll("-", "")}`;
  ids.push(id);
  await db.insert(rateLimit).values({ id, key: id, count: 1, lastRequest: Date.now() - age });
  return id;
}

describe("bounded verification limiter retention", () => {
  it("removes expired owned counters, preserves active/native rows, and bounds each scan", async () => {
    const old = await seed(48 * 3600_000);
    const active = await seed(0);
    const native = await seed(48 * 3600_000, true);
    const result = await purgeVerificationLimits(db, { batchSize: 500, maxBatches: 100 });
    expect(result.scanned).toBeLessThanOrEqual(50_000);
    const rows = await db
      .select()
      .from(rateLimit)
      .where(inArray(rateLimit.id, [old, active, native]));
    expect(rows.map((row) => row.id).sort()).toEqual([active, native].sort());
  });

  it("resumes a bounded scan rather than starving expired rows after active pages", async () => {
    const active = await seed(0);
    const stale = await seed(48 * 3600_000);
    // Reset only maintenance's cursor, never other limiter state.
    await db
      .update(rateLimit)
      .set({ key: "verification:" })
      .where(eq(rateLimit.id, "verification:maintenance"));
    for (let i = 0; i < 4; i++) {
      const result = await purgeVerificationLimits(db, { batchSize: 1, maxBatches: 1 });
      expect(result.scanned).toBeLessThanOrEqual(1);
    }
    expect(await db.select().from(rateLimit).where(eq(rateLimit.id, stale))).toHaveLength(0);
    expect(await db.select().from(rateLimit).where(eq(rateLimit.id, active))).toHaveLength(1);
  });

  it("rechecks expiry after a concurrent request renews an old row", async () => {
    const id = await seed(48 * 3600_000);
    await db
      .update(rateLimit)
      .set({ key: "verification:" })
      .where(eq(rateLimit.id, "verification:maintenance"));
    const client = await pool.connect();
    let purging: ReturnType<typeof purgeVerificationLimits> | undefined;
    try {
      await client.query("BEGIN");
      const pid = (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      if (!pid) throw new Error("Missing transaction PID");
      await client.query("update rate_limit set last_request = $1 where id = $2", [Date.now(), id]);
      purging = purgeVerificationLimits(db);
      await waitForBlockingChain(pool, pid, 1);
      await client.query("COMMIT");
      await purging;
      expect(await db.select().from(rateLimit).where(eq(rateLimit.id, id))).toHaveLength(1);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await purging?.catch(() => {});
    }
  });
});
