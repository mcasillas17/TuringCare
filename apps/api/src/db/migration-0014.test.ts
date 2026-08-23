import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { pool } from ".";
import { waitForBlockingChain } from "../test-pg-concurrency";

const migrationUrl = new URL("../../drizzle/0014_third_madripoor.sql", import.meta.url);
const schemasToDrop: string[] = [];

afterEach(async () => {
  for (const schema of schemasToDrop.splice(0)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("migration 0014 concurrent legacy writers", () => {
  it("blocks a duplicate writer before repair until the unique constraint is committed", async () => {
    const schema = `migration_0014_${randomUUID().replaceAll("-", "")}`;
    schemasToDrop.push(schema);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`
      CREATE TABLE "${schema}"."briefs" (
        "id" text PRIMARY KEY,
        "dog_id" text NOT NULL,
        "version" integer NOT NULL,
        "generated_at" timestamptz NOT NULL
      )
    `);
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
    const [lockStatement, ...remainingStatements] = statements;
    if (!lockStatement) throw new Error("migration 0014 has no SQL statements");
    const migration = await pool.connect();
    const legacyWriter = await pool.connect();
    let migrationOpen = false;

    try {
      await migration.query("BEGIN");
      migrationOpen = true;
      await migration.query(`SET LOCAL search_path TO "${schema}"`);
      await legacyWriter.query(`SET search_path TO "${schema}"`);
      const pidResult = await migration.query<{ pid: number }>(
        "SELECT pg_backend_pid()::integer AS pid",
      );
      const migrationPid = Number(pidResult.rows[0]?.pid);

      await migration.query(lockStatement);
      const writerAttempt = legacyWriter
        .query(
          `INSERT INTO "briefs" ("id", "dog_id", "version", "generated_at")
           VALUES ('brief-legacy', 'dog-a', 1, '2026-01-03T00:00:00Z')`,
        )
        .then(
          () => ({ status: "inserted" as const }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        );

      const beforeRepair = await Promise.race([
        writerAttempt.then(() => "writer_completed" as const),
        waitForBlockingChain(pool, migrationPid, 1).then(() => "writer_blocked" as const),
      ]);
      expect(beforeRepair).toBe("writer_blocked");

      for (const statement of remainingStatements) await migration.query(statement);
      await migration.query("COMMIT");
      migrationOpen = false;

      const writerResult = await writerAttempt;
      expect(writerResult.status).toBe("rejected");
      expect(
        (writerResult as { error?: { code?: string; constraint?: string } }).error,
      ).toMatchObject({
        code: "23505",
        constraint: "briefs_dog_id_version_unique",
      });

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
      if (migrationOpen) await migration.query("ROLLBACK");
      await legacyWriter.query("RESET search_path");
      migration.release();
      legacyWriter.release();
    }
  });
});
