import {
  VerificationRetentionIncompleteError,
  purgeVerificationLimits,
  verificationRetentionFailure,
} from "../auth/verification-retention";
import { db, pool } from "../db";
import { env } from "../env";
import { purgeOldEvents } from "./retention";

// Runnable entrypoint for the scheduled GitHub Actions retention job.
async function main() {
  try {
    const removed = await purgeOldEvents(db, env.EVENT_RETENTION_DAYS);
    console.log(`[retention] deleted ${removed} events older than ${env.EVENT_RETENTION_DAYS}d`);
    const verification = await purgeVerificationLimits(db, { waitForTurn: true });
    console.log("[retention] verification counters", verification);
    if (!verification.complete) {
      throw new VerificationRetentionIncompleteError(
        verification.busy ? "busy" : "budget_exhausted",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[retention] failed", verificationRetentionFailure(error));
  process.exit(1);
});
