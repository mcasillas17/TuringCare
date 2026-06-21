import { avg, count, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "../db";
import { briefs, dogs, journalEntries, trainingGoals, trainingSkills } from "../db/schema";

export type DogSummary = {
  journalCount: number;
  lastActivityAt: string | null;
  goalCount: number;
  skillCount: number;
  avgLevel: number | null;
  briefStatus: "draft" | "finalized" | null;
  briefVersion: number | null;
};

export type DogOverview = typeof dogs.$inferSelect & { summary: DogSummary };

export async function loadDogsOverview(ownerId: string): Promise<DogOverview[]> {
  const rows = await db
    .select()
    .from(dogs)
    .where(eq(dogs.ownerId, ownerId))
    .orderBy(desc(dogs.createdAt));
  const ids = rows.map((d) => d.id);
  if (ids.length === 0) return [];

  const [journalAgg, goalAgg, skillAgg, briefRows] = await Promise.all([
    db
      .select({ dogId: journalEntries.dogId, n: count(), last: max(journalEntries.occurredAt) })
      .from(journalEntries)
      .where(inArray(journalEntries.dogId, ids))
      .groupBy(journalEntries.dogId),
    db
      .select({ dogId: trainingGoals.dogId, n: count() })
      .from(trainingGoals)
      .where(inArray(trainingGoals.dogId, ids))
      .groupBy(trainingGoals.dogId),
    db
      .select({
        dogId: trainingGoals.dogId,
        n: count(trainingSkills.id),
        avg: avg(trainingSkills.confidence),
      })
      .from(trainingSkills)
      .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
      .where(inArray(trainingGoals.dogId, ids))
      .groupBy(trainingGoals.dogId),
    db
      .select({
        dogId: briefs.dogId,
        status: briefs.status,
        version: briefs.version,
        generatedAt: briefs.generatedAt,
      })
      .from(briefs)
      .where(inArray(briefs.dogId, ids))
      .orderBy(desc(briefs.generatedAt)),
  ]);

  const jMap = new Map(journalAgg.map((r) => [r.dogId, r]));
  const gMap = new Map(goalAgg.map((r) => [r.dogId, r]));
  const sMap = new Map(skillAgg.map((r) => [r.dogId, r]));
  const bMap = new Map<string, (typeof briefRows)[number]>();
  for (const b of briefRows) if (!bMap.has(b.dogId)) bMap.set(b.dogId, b); // ordered desc → first is latest

  return rows.map((d) => {
    const j = jMap.get(d.id);
    const s = sMap.get(d.id);
    const b = bMap.get(d.id);
    return {
      ...d,
      summary: {
        journalCount: Number(j?.n ?? 0),
        lastActivityAt: j?.last ? new Date(j.last).toISOString() : null,
        goalCount: Number(gMap.get(d.id)?.n ?? 0),
        skillCount: Number(s?.n ?? 0),
        avgLevel: s?.avg != null ? Number(Number(s.avg).toFixed(1)) : null,
        briefStatus: b?.status ?? null,
        briefVersion: b?.version ?? null,
      },
    };
  });
}
