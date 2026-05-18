import { db, pool } from "../db";
import { env } from "../env";
import { purgeOldEvents } from "./retention";

// Runnable entrypoint for the scheduled GitHub Actions retention job.
async function main() {
  const removed = await purgeOldEvents(db, env.EVENT_RETENTION_DAYS);
  console.log(`[retention] deleted ${removed} events older than ${env.EVENT_RETENTION_DAYS}d`);
  await pool.end();
}

main().catch((err) => {
  console.error("[retention] failed:", err);
  process.exit(1);
});
