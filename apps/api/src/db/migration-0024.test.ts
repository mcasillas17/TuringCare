import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { pool } from ".";

const migrationUrl = new URL(
  "../../drizzle/0024_brief_share_telemetry_privacy.sql",
  import.meta.url,
);
const schemasToDrop: string[] = [];

afterEach(async () => {
  for (const schema of schemasToDrop.splice(0)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("migration 0024 telemetry privacy cleanup", () => {
  it("canonicalizes historical public Brief paths without changing unrelated aggregates", async () => {
    const schema = `migration_0024_${randomUUID().replaceAll("-", "")}`;
    schemasToDrop.push(schema);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`
      CREATE TABLE "${schema}"."events" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "name" text NOT NULL,
        "props" jsonb NOT NULL
      )
    `);
    await pool.query(
      `INSERT INTO "${schema}"."events" ("name", "props") VALUES
        ('page.viewed', '{"path":"/b/fixture-share-segment"}'),
        ('page.viewed', '{"path":"/B/fixture%2Fencoded///#fixture"}'),
        ('trainer.viewed', '{"path":"/b/fixture-share-segment?source=fixture"}'),
        ('page.viewed', '{"path":"/%62/fixture-share-segment"}'),
        ('trainer.viewed', '{"path":"/%42/fixture%2Fencoded///"}'),
        ('page.viewed', '{"path":"/%62/fixture%"}'),
        ('page.viewed', '{"path":"/b/fixture/child"}'),
        ('page.viewed', '{"path":"/%62/fixture/child"}'),
        ('page.viewed', '{"path":"/%2562/fixture"}'),
        ('page.viewed', '{"path":"/%6Z/fixture"}'),
        ('page.viewed', '{"path":"/billing"}'),
        ('page.viewed', '{"path":12}')`,
    );

    const migrationSql = await readFile(migrationUrl, "utf8");
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(`SET LOCAL search_path TO "${schema}"`);
      await connection.query(migrationSql);
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }

    const result = await pool.query<{ path: string; count: number }>(
      `SELECT "props"->>'path' AS path, count(*)::integer AS count
       FROM "${schema}"."events"
       GROUP BY 1
       ORDER BY 1`,
    );
    expect(result.rows).toHaveLength(7);
    expect(result.rows).toEqual(
      expect.arrayContaining([
        { path: "12", count: 1 },
        { path: "/b/fixture/child", count: 1 },
        { path: "/%62/fixture/child", count: 1 },
        { path: "/%2562/fixture", count: 1 },
        { path: "/%6Z/fixture", count: 1 },
        { path: "/billing", count: 1 },
        { path: "/b/:token", count: 6 },
      ]),
    );
  });
});
