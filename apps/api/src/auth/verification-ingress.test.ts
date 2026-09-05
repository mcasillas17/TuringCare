import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app";
import { type DB, db as defaultDb, pool as observerPool } from "../db";
import { rateLimit } from "../db/schema";
import { type TestUser, createUnverifiedTestUser } from "../test-helpers";
import { waitForBlockingChain } from "../test-pg-concurrency";
import { createRateLimitTestDatabase } from "../test-rate-limit-db";
import { consumeVerificationLimit, verificationLimitKey } from "./verification-rate-limit";
import * as retention from "./verification-retention";

let fixture: Awaited<ReturnType<typeof createRateLimitTestDatabase>>;
let db: DB;
const accounts: TestUser[] = [];
beforeEach(async () => {
  fixture = await createRateLimitTestDatabase();
  db = fixture.database;
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const account of accounts.splice(0)) await account.cleanup();
  await fixture.cleanup();
});

async function oldCounters(count: number) {
  await fixture.pool.query(
    `
    insert into rate_limit (id, key, count, last_request)
    select 'verification:credential:' || lpad(to_hex(i), 64, '0'),
      'verification:credential:' || lpad(to_hex(i), 64, '0'), 1,
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 172800000
    from generate_series(1, $1::integer) i`,
    [count],
  );
}

async function expiredCount() {
  const result = await fixture.pool.query<{ count: number }>(`
    select count(*)::int as count from rate_limit
    where id like 'verification:credential:%'
      and last_request < floor(extract(epoch from clock_timestamp()) * 1000)::bigint - 86400000`);
  return result.rows[0]?.count;
}

describe("verification ingress maintenance", () => {
  it("measures the real 100-row page without a rate-limit table scan", async () => {
    await oldCounters(5000);
    await fixture.pool.query("analyze rate_limit");
    type Plan = {
      "Node Type": string;
      "Relation Name"?: string;
      "Actual Rows"?: number;
      "Actual Loops"?: number;
      Plans?: Plan[];
    };
    const result = await db.execute<{
      "QUERY PLAN": { Plan: Plan; "Execution Time": number }[];
    }>(
      sql`explain (analyze, buffers, format json) ${retention.verificationRetentionPage("verification:", 100)}`,
    );
    const report = result.rows[0]?.["QUERY PLAN"][0];
    if (!report) throw new Error("Missing query-plan evidence");
    const nodes: Plan[] = [];
    const collect = (node: Plan) => {
      nodes.push(node);
      for (const child of node.Plans ?? []) collect(child);
    };
    collect(report.Plan);
    expect(nodes.find((node) => node["Node Type"] === "Limit")?.["Actual Rows"]).toBe(100);
    const accesses = nodes.filter((node) => node["Relation Name"] === "rate_limit");
    expect(accesses.some((node) => node["Node Type"].includes("Index"))).toBe(true);
    expect(accesses.some((node) => node["Node Type"] === "Seq Scan")).toBe(false);
    console.info("[verification-retention-page-evidence]", {
      fixtureRows: 5000,
      pageRows: 100,
      executionMs: report["Execution Time"],
      accesses: accesses.map((node) => ({
        type: node["Node Type"],
        rows: node["Actual Rows"],
        loops: node["Actual Loops"],
      })),
    });
  });
  it("only newly inserted pairs trigger cleanup, never repeat/saturated/reset windows", async () => {
    const purge = vi.spyOn(retention, "purgeVerificationLimits").mockResolvedValue({
      removed: 0,
      scanned: 0,
      complete: true,
      busy: false,
    });
    const key = JSON.stringify(["synthetic@example.com", "198.18.0.1"]);
    await consumeVerificationLimit("ip", "198.18.0.1", db);
    await consumeVerificationLimit("send", "synthetic@example.com", db);
    for (let i = 0; i < 7; i++) await consumeVerificationLimit("credential", key, db);
    await db
      .update(rateLimit)
      .set({ lastRequest: Date.now() - 61_000 })
      .where(eq(rateLimit.id, verificationLimitKey("credential", key)));
    await consumeVerificationLimit("credential", key, db);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith(db, { batchSize: 100, maxBatches: 1, waitForTurn: true });
  });

  it("schedules only one page for concurrent insertion attempts on the same pair", async () => {
    const purge = vi.spyOn(retention, "purgeVerificationLimits").mockResolvedValue({
      removed: 0,
      scanned: 0,
      complete: true,
      busy: false,
    });
    const pair = JSON.stringify(["same-pair@example.com", "198.18.0.1"]);
    const results = await Promise.all(
      Array.from({ length: 15 }, () => consumeVerificationLimit("credential", pair, db)),
    );
    expect(results.filter((value) => value === 0)).toHaveLength(5);
    expect(purge).toHaveBeenCalledOnce();
  });

  it("treats a busy cleanup outcome as deferred maintenance rather than an auth failure", async () => {
    vi.spyOn(retention, "purgeVerificationLimits").mockResolvedValue({
      removed: 0,
      scanned: 0,
      complete: false,
      busy: true,
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await consumeVerificationLimit(
        "credential",
        JSON.stringify(["busy@example.com", "198.18.0.1"]),
        db,
      ),
    ).toBe(0);
    expect(warning.mock.calls).toEqual([
      ["[auth] verification_retention_deferred", { reason: "busy" }],
    ]);
  });

  it("scales sequential cleanup with admitted new pairs and retains active counters", async () => {
    await oldCounters(4000);
    const purge = vi.spyOn(retention, "purgeVerificationLimits");
    for (let i = 0; i < 30; i++) {
      const ip = `198.18.0.${(i % 2) + 1}`;
      expect(await consumeVerificationLimit("ip", ip, db)).toBe(0);
      expect(
        await consumeVerificationLimit(
          "credential",
          JSON.stringify([`pair-${i}@example.com`, ip]),
          db,
        ),
      ).toBe(0);
    }
    expect(purge).toHaveBeenCalledTimes(30);
    expect(await expiredCount()).toBe(1000);
    const pages = await Promise.all(purge.mock.results.map((result) => result.value));
    expect(pages.reduce((sum, page) => sum + page.scanned, 0)).toBe(3000);
    console.info("[verification-retention-sequential-evidence]", {
      admittedPairs: 30,
      scanned: 3000,
      expiredRemoved: 3000,
    });
  });

  it("queued concurrent ingress catches up after a busy cursor without dropping scan turns", async () => {
    await oldCounters(4000);
    await db
      .insert(rateLimit)
      .values({ id: "verification:maintenance", key: "verification:", count: 0, lastRequest: 0 });
    const client = await fixture.pool.connect();
    let work: Promise<number[]> | undefined;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const purge = vi.spyOn(retention, "purgeVerificationLimits");
    const startedAt = performance.now();
    try {
      await client.query("begin");
      const pid = (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
        ?.pid;
      if (!pid) throw new Error("Missing fixture PID");
      await client.query(
        "select id from rate_limit where id = 'verification:maintenance' for update",
      );
      work = Promise.all(
        Array.from({ length: 40 }, async (_, i) => {
          const ip = `198.18.0.${(i % 2) + 1}`;
          expect(await consumeVerificationLimit("ip", ip, db)).toBe(0);
          return consumeVerificationLimit(
            "credential",
            JSON.stringify([`burst-${i}@example.com`, ip]),
            db,
          );
        }),
      );
      await waitForBlockingChain(observerPool, pid, 2);
      await client.query("commit");
      expect(await work).toEqual(Array(40).fill(0));
      expect(await expiredCount()).toBe(0);
      expect(warning).not.toHaveBeenCalled();
      const pages = await Promise.all(purge.mock.results.map((result) => result.value));
      expect(pages).toHaveLength(40);
      expect(pages.reduce((sum, page) => sum + page.scanned, 0)).toBe(4000);
      console.info("[verification-retention-burst-evidence]", {
        admittedPairs: 40,
        trustedIPs: 2,
        scanned: 4000,
        expiredRemoved: 4000,
        deferred: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      await client.query("rollback");
      client.release();
      await work?.catch(() => {});
    }
  });

  it("recovers deferred debt after a real cursor lock timeout without rejecting the credential", async () => {
    await oldCounters(400);
    await db
      .insert(rateLimit)
      .values({ id: "verification:maintenance", key: "verification:", count: 0, lastRequest: 0 });
    const client = await fixture.pool.connect();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await client.query("begin");
      await client.query(
        "select id from rate_limit where id = 'verification:maintenance' for update",
      );
      // Keep the lock until PostgreSQL itself hits the configured 1s deadline.
      expect(
        await consumeVerificationLimit(
          "credential",
          JSON.stringify(["deferred@example.com", "198.18.0.1"]),
          db,
        ),
      ).toBe(0);
      expect(warning.mock.calls).toEqual([
        ["[auth] verification_retention_deferred", { reason: "busy", sqlState: "55P03" }],
      ]);
      expect(await expiredCount()).toBe(400);
      const marker = await fixture.pool.query<{ key: string }>(
        "select key from rate_limit where id = 'verification:maintenance'",
      );
      expect(marker.rows[0]?.key).toBe("verification:");
      await client.query("commit");
      for (let pair = 0; pair < 4; pair++) {
        expect(
          await consumeVerificationLimit(
            "credential",
            JSON.stringify([`catch-up-${pair}@example.com`, "198.18.0.2"]),
            db,
          ),
        ).toBe(0);
      }
      expect(await expiredCount()).toBe(0);
      console.info("[verification-retention-deferred-evidence]", {
        sqlState: "55P03",
        accepted: true,
        deferredExpiredRows: 400,
        remainingAfterCatchUp: 0,
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("reports cleanup failure privately and still accepts a valid resend without refunding quota", async () => {
    const account = await createUnverifiedTestUser();
    accounts.push(account);
    await defaultDb
      .update(rateLimit)
      .set({ lastRequest: Date.now() - 61_000 })
      .where(eq(rateLimit.id, verificationLimitKey("send", account.email)));
    const error = new Error(`private-cause ${account.email}`, {
      cause: { code: "40P01", message: "private-sql" },
    });
    const purge = vi.spyOn(retention, "purgeVerificationLimits").mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = () =>
      app.request("/api/verification/resend", {
        method: "POST",
        headers: account.authHeaders,
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted" });
    expect(purge).toHaveBeenCalledOnce();
    expect(log.mock.calls).toEqual([
      ["[auth] verification_retention_failed", { reason: "database_error", sqlState: "40P01" }],
    ]);
    expect((await request()).status).toBe(429);
    expect(purge).toHaveBeenCalledOnce();
  });
});
