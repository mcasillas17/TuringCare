import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { db, pool } from "../db";
import { journalEntries } from "../db/schema";
import type { TransactionType } from "../lib/safety-lock";
import { type TestUser, createTestUser } from "../test-helpers";

const { guardedWrites } = vi.hoisted(() => ({
  guardedWrites: [] as { dogId: string; lockHeldDuringWrite: boolean }[],
}));

/**
 * Wraps the real helper so routes still take the real advisory lock, while
 * recording that every journal mutation ran its write inside that lock.
 */
vi.mock("../lib/safety-lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/safety-lock")>();
  return {
    ...actual,
    lockDogSafety: async (tx: TransactionType, dogId: string): Promise<void> => {
      await actual.lockDogSafety(tx, dogId);
      guardedWrites.push({ dogId, lockHeldDuringWrite: !(await dogSafetyLockIsFree(dogId)) });
    },
    withDogSafetyLock: async <T>(
      dogId: string,
      callback: (tx: TransactionType) => Promise<T>,
    ): Promise<T> =>
      actual.withDogSafetyLock(dogId, async (tx) => {
        guardedWrites.push({ dogId, lockHeldDuringWrite: !(await dogSafetyLockIsFree(dogId)) });
        return callback(tx);
      }),
  };
});

/** `false` proves another transaction currently holds the lock — no sleeps. */
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

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

describe("dog journal mutations serialize through the dog safety lock", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });
  beforeEach(() => {
    guardedWrites.length = 0;
  });

  async function setup() {
    const u = await createTestUser();
    users.push(u);
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    expect(res.status).toBe(201);
    const { dog } = (await res.json()) as { dog: { id: string } };
    return { u, dog };
  }

  it("creates, updates and deletes an entry with the lock held for every write", async () => {
    const { u, dog } = await setup();

    const created = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "Barked at the doorbell", intensity: 3 }),
    });
    expect(created.status).toBe(201);
    const { entry } = (await created.json()) as {
      entry: { id: string; note: string; intensity: number | null };
    };
    expect(entry.note).toBe("Barked at the doorbell");
    expect(entry.intensity).toBe(3);

    const updated = await app.request(`/api/dogs/${dog.id}/journal/${entry.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ note: "Barked twice", intensity: 5 }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: entry.id, note: "Barked twice", intensity: 5 }),
      }),
    );

    const deleted = await app.request(`/api/dogs/${dog.id}/journal/${entry.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });

    expect(await db.select().from(journalEntries).where(eq(journalEntries.dogId, dog.id))).toEqual(
      [],
    );

    expect(guardedWrites).toEqual([
      { dogId: dog.id, lockHeldDuringWrite: true },
      { dogId: dog.id, lockHeldDuringWrite: true },
      { dogId: dog.id, lockHeldDuringWrite: true },
    ]);
  });

  it("rejects an invalid create date before taking the lock", async () => {
    const { u, dog } = await setup();
    const res = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "moment", note: "n", occurredAt: "not-a-date" }),
    });
    expect(res.status).toBe(400);
    expect(guardedWrites).toEqual([]);
  });

  it("keeps update validation and ownership semantics under the lock", async () => {
    const { u, dog } = await setup();
    const created = await app.request(`/api/dogs/${dog.id}/journal`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ kind: "daily_checkin", note: "ok", trend: "same" }),
    });
    const { entry } = (await created.json()) as { entry: { id: string } };
    guardedWrites.length = 0;

    const badDate = await app.request(`/api/dogs/${dog.id}/journal/${entry.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ occurredAt: "not-a-date" }),
    });
    expect(badDate.status).toBe(400);

    const missing = await app.request(`/api/dogs/${dog.id}/journal/${crypto.randomUUID()}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ note: "nope" }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    const [unchanged] = await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.dogId, dog.id)))
      .limit(1);
    expect(unchanged?.note).toBe("ok");
    expect(guardedWrites.every((write) => write.lockHeldDuringWrite)).toBe(true);
    expect(guardedWrites.map((write) => write.dogId)).toEqual([dog.id, dog.id]);
  });

  it("never takes the lock for a dog the caller does not own", async () => {
    const { dog } = await setup();
    const other = await createTestUser();
    users.push(other);
    guardedWrites.length = 0;

    for (const [method, body] of [
      ["POST", JSON.stringify({ kind: "moment", note: "n" })],
      ["PUT", JSON.stringify({ note: "n" })],
      ["DELETE", undefined],
    ] as const) {
      const path =
        method === "POST"
          ? `/api/dogs/${dog.id}/journal`
          : `/api/dogs/${dog.id}/journal/${crypto.randomUUID()}`;
      const res = await app.request(path, { method, headers: other.authHeaders, body });
      expect(res.status).toBe(404);
    }
    expect(guardedWrites).toEqual([]);
  });
});
