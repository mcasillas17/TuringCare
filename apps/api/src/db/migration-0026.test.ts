import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { pool } from ".";

const migrationUrl = new URL("../../drizzle/0026_first_nitro.sql", import.meta.url);
const schemasToDrop: string[] = [];

afterEach(async () => {
  for (const schema of schemasToDrop.splice(0)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("migration 0026 Brief delivery claims", () => {
  it("blocks every claimed delivery while permitting cleared deletes", async () => {
    const schema = `migration_0026_${randomUUID().replaceAll("-", "")}`;
    schemasToDrop.push(schema);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE "${schema}"."brief_sends" ("id" uuid PRIMARY KEY)`);

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

    const activeId = randomUUID();
    const failClosedId = randomUUID();
    const staleId = randomUUID();
    const clearedId = randomUUID();
    await pool.query(
      `INSERT INTO "${schema}"."brief_sends"
        ("id", "delivery_claim_id", "delivery_claimed_at")
       VALUES
        ($1, 'active', clock_timestamp()),
        ($2, 'missing-timestamp', NULL),
        ($3, 'stale', clock_timestamp() - interval '31 seconds'),
        ($4, NULL, NULL)`,
      [activeId, failClosedId, staleId, clearedId],
    );

    await expect(
      pool.query(`DELETE FROM "${schema}"."brief_sends" WHERE "id" = $1`, [activeId]),
    ).rejects.toMatchObject({ constraint: "brief_sends_delivery_in_progress" });
    await expect(
      pool.query(`DELETE FROM "${schema}"."brief_sends" WHERE "id" = $1`, [failClosedId]),
    ).rejects.toMatchObject({ constraint: "brief_sends_delivery_in_progress" });
    await expect(
      pool.query(`DELETE FROM "${schema}"."brief_sends" WHERE "id" = $1`, [staleId]),
    ).rejects.toMatchObject({ constraint: "brief_sends_delivery_in_progress" });

    const clearedDelete = await pool.query(
      `DELETE FROM "${schema}"."brief_sends" WHERE "id" = $1`,
      [clearedId],
    );
    expect(clearedDelete.rowCount).toBe(1);
  });
});
