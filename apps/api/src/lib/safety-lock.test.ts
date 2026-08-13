import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db, pool } from "../db";
import { dogSafetySignals } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { withDogSafetyLock } from "./safety-lock";

/**
 * Asks an independent connection whether the dog-safety advisory lock is free.
 * `false` proves another transaction currently holds it — no sleeps needed.
 */
async function dogSafetyLockIsFree(dogId: string): Promise<boolean> {
  const probe = await pool.connect();
  try {
    await probe.query("begin");
    const { rows } = await probe.query<{ acquired: boolean }>(
      "select pg_try_advisory_xact_lock(hashtext($1)) as acquired",
      [`dog-safety:${dogId}`],
    );
    return rows[0]?.acquired === true;
  } finally {
    await probe.query("rollback");
    probe.release();
  }
}

describe("withDogSafetyLock", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function makeDog(): Promise<string> {
    const u = await createTestUser();
    users.push(u);
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({
        name: "Biscuit",
        size: "medium",
        sex: "female",
        source: "rescue",
        vaccineStage: "in_progress",
        spayedNeutered: true,
      }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { dog: { id: string } }).dog.id;
  }

  it("holds the dog safety lock for the whole callback and releases it on commit", async () => {
    const dogId = randomUUID();
    const heldDuringCallback: boolean[] = [];

    const result = await withDogSafetyLock(dogId, async (tx) => {
      heldDuringCallback.push(!(await dogSafetyLockIsFree(dogId)));
      await tx.execute(sql`select 1`);
      heldDuringCallback.push(!(await dogSafetyLockIsFree(dogId)));
      return "guarded-write-complete";
    });

    expect(result).toBe("guarded-write-complete");
    expect(heldDuringCallback).toEqual([true, true]);
    expect(await dogSafetyLockIsFree(dogId)).toBe(true);
  });

  it("does not block a different dog", async () => {
    const dogId = randomUUID();
    const otherDogId = randomUUID();
    expect(await withDogSafetyLock(dogId, async () => dogSafetyLockIsFree(otherDogId))).toBe(true);
  });

  it("rolls the guarded write back and releases the lock when the callback throws", async () => {
    const dogId = await makeDog();

    await expect(
      withDogSafetyLock(dogId, async (tx) => {
        await tx
          .insert(dogSafetySignals)
          .values({ dogId, type: "injury_or_pain", source: "behavior_concern" });
        throw new Error("guarded write failed");
      }),
    ).rejects.toThrow("guarded write failed");

    expect(
      await db.select().from(dogSafetySignals).where(eq(dogSafetySignals.dogId, dogId)),
    ).toEqual([]);
    expect(await dogSafetyLockIsFree(dogId)).toBe(true);
  });
});
