import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { preparePredeployMigrationFolder } from "./migration-rollout";

const POSTDEPLOY_MIGRATIONS = [
  "0023_third_madripoor",
  "0024_brief_share_telemetry_privacy",
] as const;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sourceFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const migrationFolder = await mkdtemp(join(tmpdir(), "turingcare-predeploy-migrations-"));
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});

try {
  await preparePredeployMigrationFolder(sourceFolder, migrationFolder, POSTDEPLOY_MIGRATIONS);
  await migrate(drizzle(pool), { migrationsFolder: migrationFolder });
} finally {
  try {
    await pool.end();
  } finally {
    await rm(migrationFolder, { recursive: true, force: true });
  }
}
