import { db as defaultDb, type DB } from "../db";
import { events } from "../db/schema";
import type { EventName } from "./events";

export interface RecordEventArgs {
  userId?: string | null;
  sessionId?: string | null;
  props?: Record<string, unknown>;
}

/**
 * Error-safe telemetry write. Callers `await` it, but it NEVER throws into
 * the request path: a failed/absent events table must not break signup or
 * any user flow. The DB error is swallowed and logged.
 */
export async function recordEvent(
  name: EventName,
  args: RecordEventArgs = {},
  database: DB = defaultDb,
): Promise<void> {
  try {
    await database.insert(events).values({
      name,
      userId: args.userId ?? null,
      sessionId: args.sessionId ?? null,
      props: args.props ?? {},
    });
  } catch (err) {
    console.error("[telemetry] recordEvent failed:", name, err);
  }
}
