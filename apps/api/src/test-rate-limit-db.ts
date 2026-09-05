import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pool as adminPool } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

/** Private local fixture schema: ingress cleanup must not race other test data. */
export async function createRateLimitTestDatabase() {
  const url = new URL(env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Rate-limit fixture requires local Postgres");
  }
  const name = `test_verification_${randomUUID().replaceAll("-", "")}`;
  await adminPool.query(`create schema "${name}"`);
  await adminPool.query(`create table "${name}".rate_limit (like public.rate_limit including all)`);
  await adminPool.query(`create table "${name}".events (like public.events including all)`);
  url.searchParams.set("options", `-c search_path=${name}`);
  const connectionString = url.toString();
  const pool = new Pool({ connectionString, max: 10 });
  return {
    pool,
    database: drizzle(pool, { schema }),
    name,
    connectionString,
    cleanup: async () => {
      await pool.end();
      await adminPool.query(`drop schema "${name}" cascade`);
    },
  };
}
