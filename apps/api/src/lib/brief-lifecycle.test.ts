import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pool } from "../db";
import { withBriefLifecycleLock } from "./brief-lifecycle";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, reject, resolve };
}

/**
 * Asks an independent connection whether the brief-lifecycle advisory lock is
 * free. `false` proves another transaction currently holds it.
 */
async function briefLifecycleLockIsFree(dogId: string): Promise<boolean> {
  const probe = await pool.connect();
  try {
    await probe.query("begin");
    const { rows } = await probe.query<{ acquired: boolean }>(
      "select pg_try_advisory_xact_lock(hashtext($1)) as acquired",
      [`brief-lifecycle:${dogId}`],
    );
    return rows[0]?.acquired === true;
  } finally {
    await probe.query("rollback");
    probe.release();
  }
}

async function waitForBriefLifecycleLockWaiter(dogId: string): Promise<void> {
  const lockKey = `brief-lifecycle:${dogId}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ waiting: boolean }>(
      "select exists (" +
        "select 1 from pg_locks " +
        "where not granted " +
        "and locktype = 'advisory' " +
        "and database = (select oid from pg_database where datname = current_database()) " +
        "and classid = case when hashtext($1) < 0 then 4294967295 else 0 end " +
        "and objid = (hashtext($1)::bigint & 4294967295) " +
        "and objsubid = 1" +
        ") as waiting",
      [lockKey],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for a brief lifecycle advisory lock waiter");
}

describe("withBriefLifecycleLock", () => {
  it("serializes two lifecycle callbacks for the same dog", async () => {
    const dogId = randomUUID();
    const holdFirst = createDeferred<void>();
    const firstStarted = createDeferred<void>();
    const order: string[] = [];

    const first = withBriefLifecycleLock(dogId, async () => {
      order.push("first-start");
      firstStarted.resolve();
      await holdFirst.promise;
      order.push("first-end");
      return "first-result";
    });

    await firstStarted.promise;

    const second = withBriefLifecycleLock(dogId, async () => {
      order.push("second");
      return "second-result";
    });

    try {
      await waitForBriefLifecycleLockWaiter(dogId);
      expect(await briefLifecycleLockIsFree(dogId)).toBe(false);
      expect(order).toEqual(["first-start"]);
    } finally {
      holdFirst.resolve();
      await Promise.allSettled([first, second]);
    }

    await expect(first).resolves.toBe("first-result");
    await expect(second).resolves.toBe("second-result");
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("lets a different dog proceed while one lifecycle callback is held", async () => {
    const firstDogId = randomUUID();
    const secondDogId = randomUUID();
    const holdFirst = createDeferred<void>();
    const firstStarted = createDeferred<void>();
    const secondEntered = createDeferred<void>();

    const first = withBriefLifecycleLock(firstDogId, async () => {
      firstStarted.resolve();
      await holdFirst.promise;
      return "first-result";
    });

    await firstStarted.promise;
    expect(await briefLifecycleLockIsFree(firstDogId)).toBe(false);

    const second = withBriefLifecycleLock(secondDogId, async () => {
      secondEntered.resolve();
      return "second-result";
    });

    try {
      await secondEntered.promise;
      await expect(second).resolves.toBe("second-result");
    } finally {
      holdFirst.resolve();
      await Promise.allSettled([first, second]);
    }

    await expect(first).resolves.toBe("first-result");
  });

  it("returns the callback result and releases the transaction-scoped lock", async () => {
    const dogId = randomUUID();

    const result = await withBriefLifecycleLock(dogId, async (tx) => {
      expect(await briefLifecycleLockIsFree(dogId)).toBe(false);
      await tx.execute(sql`select 1`);
      return { status: "locked" as const };
    });

    expect(result).toEqual({ status: "locked" });
    expect(await briefLifecycleLockIsFree(dogId)).toBe(true);
  });
});
