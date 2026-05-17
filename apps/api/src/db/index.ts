import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

// Local Docker Postgres speaks plaintext; managed Postgres (Supabase) requires
// TLS. rejectUnauthorized:false because Supabase's pooler presents a cert chain
// node-postgres won't verify by default — the connection is still encrypted.
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
export type DB = typeof db;
