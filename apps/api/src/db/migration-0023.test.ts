import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { pool } from ".";
import { waitForBlockingChain } from "../test-pg-concurrency";

const migrationUrl = new URL("../../drizzle/0023_third_madripoor.sql", import.meta.url);
const schemasToDrop: string[] = [];

afterEach(async () => {
  for (const schema of schemasToDrop.splice(0)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("migration 0023 concurrency", () => {
  it("waits behind a route dog lock before taking its Brief table lock", async () => {
    const schema = `migration_0023_${randomUUID().replaceAll("-", "")}`;
    schemasToDrop.push(schema);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`
      CREATE TABLE "${schema}"."dogs" (
        "id" text PRIMARY KEY
      );
      CREATE TABLE "${schema}"."briefs" (
        "id" text PRIMARY KEY,
        "dog_id" text NOT NULL REFERENCES "${schema}"."dogs"("id") ON DELETE CASCADE,
        "version" integer NOT NULL,
        "generated_at" timestamptz NOT NULL,
        "status" text NOT NULL DEFAULT 'draft'
      )
    `);
    await pool.query(`INSERT INTO "${schema}"."dogs" ("id") VALUES ('dog-a'), ('dog-b')`);
    await pool.query(
      `INSERT INTO "${schema}"."briefs" ("id", "dog_id", "version", "generated_at")
       VALUES
         ('brief-a', 'dog-a', 1, '2026-01-01T00:00:00Z'),
         ('brief-b', 'dog-a', 1, '2026-01-02T00:00:00Z'),
         ('brief-c', 'dog-b', 2, '2026-01-01T00:00:00Z'),
         ('brief-d', 'dog-b', 4, '2026-01-02T00:00:00Z')`,
    );

    const sql = await readFile(migrationUrl, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    const [dogLockStatement, briefLockStatement, ...remainingStatements] = statements;
    if (!dogLockStatement || !briefLockStatement) {
      throw new Error("migration 0023 must lock dogs before briefs");
    }
    const migration = await pool.connect();
    const route = await pool.connect();
    let migrationOpen = false;
    let routeOpen = false;

    try {
      await route.query("BEGIN");
      routeOpen = true;
      await route.query(`SET LOCAL search_path TO "${schema}"`);
      await route.query(`SELECT "id" FROM "dogs" WHERE "id" = 'dog-a' FOR UPDATE`);
      await route.query(`SELECT "id" FROM "briefs" WHERE "id" = 'brief-a' FOR UPDATE`);
      const routePidResult = await route.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const routePid = Number(routePidResult.rows[0]?.pid);

      await migration.query("BEGIN");
      migrationOpen = true;
      await migration.query(`SET LOCAL search_path TO "${schema}"`);
      const migrationAttempt = (async () => {
        await migration.query(dogLockStatement);
        await migration.query(briefLockStatement);
        for (const statement of remainingStatements) await migration.query(statement);
        await migration.query("COMMIT");
        migrationOpen = false;
      })();

      await waitForBlockingChain(pool, routePid, 1);
      await route.query(`UPDATE "briefs" SET "status" = 'finalized' WHERE "id" = 'brief-a'`);
      await route.query("COMMIT");
      routeOpen = false;
      await migrationAttempt;

      const versions = await pool.query<{ version: number }>(
        `SELECT "version" FROM "${schema}"."briefs"
         WHERE "dog_id" = 'dog-a' ORDER BY "version"`,
      );
      expect(versions.rows.map(({ version }) => version)).toEqual([1, 2]);
      const existingGap = await pool.query<{ version: number }>(
        `SELECT "version" FROM "${schema}"."briefs"
         WHERE "dog_id" = 'dog-b' ORDER BY "version"`,
      );
      expect(existingGap.rows.map(({ version }) => version)).toEqual([2, 4]);
    } finally {
      if (routeOpen) await route.query("ROLLBACK");
      if (migrationOpen) await migration.query("ROLLBACK");
      migration.release();
      route.release();
    }
  });
});
