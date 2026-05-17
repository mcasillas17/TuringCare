import { defineConfig } from "drizzle-kit";

// Same TLS rule as src/db/index.ts: plaintext for local Docker Postgres,
// encrypted (no strict cert verify) for managed Postgres like Supabase, so the
// CI `migrate` job can reach the production pooler.
const url = process.env.DATABASE_URL ?? "";
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
  },
});
