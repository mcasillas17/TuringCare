import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { journalEntries } from "../db/schema";

/** How recent a daily check-in must be to influence today's suggestion. */
export const OBSERVATION_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecentObservation = { trend: "better" | "same" | "harder"; occurredAt: Date } | null;

/** Latest structured daily check-in trend within the observation window. */
export async function loadRecentObservation(dogId: string, now: Date): Promise<RecentObservation> {
  const cutoff = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * DAY_MS);
  const [row] = await db
    .select({
      id: journalEntries.id,
      trend: journalEntries.trend,
      occurredAt: journalEntries.occurredAt,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.dogId, dogId),
        eq(journalEntries.kind, "daily_checkin"),
        gte(journalEntries.occurredAt, cutoff),
        lte(journalEntries.occurredAt, now),
      ),
    )
    .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.id))
    .limit(1);
  if (!row || !row.trend) return null;
  return { trend: row.trend, occurredAt: row.occurredAt };
}
