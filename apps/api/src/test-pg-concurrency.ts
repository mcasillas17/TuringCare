import type { Pool } from "pg";

const POLL_INTERVAL_MS = 5;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Wait until at least `minimumBlocked` PostgreSQL sessions are directly or
 * transitively waiting on `rootPid`. This observes lock state instead of
 * relying on request timing.
 */
export async function waitForBlockingChain(
  pool: Pool,
  rootPid: number,
  minimumBlocked: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked_count: number }>(
      `WITH RECURSIVE blocked(pid) AS (
        SELECT activity.pid
        FROM pg_stat_activity AS activity
        WHERE $1 = ANY(pg_blocking_pids(activity.pid))
        UNION
        SELECT activity.pid
        FROM pg_stat_activity AS activity
        INNER JOIN blocked AS prior
          ON prior.pid = ANY(pg_blocking_pids(activity.pid))
      )
      SELECT COUNT(*)::integer AS blocked_count FROM blocked`,
      [rootPid],
    );
    lastCount = Number(result.rows[0]?.blocked_count ?? 0);
    if (lastCount >= minimumBlocked) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `timed out waiting for ${minimumBlocked} PostgreSQL sessions blocked by ${rootPid}; saw ${lastCount}`,
  );
}

/** Wait until the named PostgreSQL session is blocked by at least one other session. */
export async function waitForSessionBlocked(
  pool: Pool,
  blockedPid: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: boolean }>(
      "SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked",
      [blockedPid],
    );
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`timed out waiting for PostgreSQL session ${blockedPid} to become blocked`);
}
