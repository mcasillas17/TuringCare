import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills, weeklyFocus } from "../db/schema";

export type FocusSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
};

export type FocusSkill = {
  skillId: string;
  name: string;
  goalId: string;
  goalName: string;
  position: number;
  sessions: FocusSession[];
};

export async function loadFocusWeek(
  dogId: string,
  startISO: string,
  endISO: string,
): Promise<{ focusSkills: FocusSkill[] }> {
  const focus = await db
    .select({
      skillId: weeklyFocus.skillId,
      position: weeklyFocus.position,
      createdAt: weeklyFocus.createdAt,
      name: trainingSkills.name,
      goalId: trainingSkills.goalId,
      goalName: trainingGoals.goal,
    })
    .from(weeklyFocus)
    .innerJoin(trainingSkills, eq(weeklyFocus.skillId, trainingSkills.id))
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(eq(weeklyFocus.dogId, dogId))
    .orderBy(asc(weeklyFocus.position), asc(weeklyFocus.createdAt));

  const skillIds = focus.map((f) => f.skillId);
  const sessions =
    skillIds.length === 0
      ? []
      : await db
          .select({
            id: practiceSessions.id,
            skillId: practiceSessions.skillId,
            occurredAt: practiceSessions.occurredAt,
            durationMinutes: practiceSessions.durationMinutes,
          })
          .from(practiceSessions)
          .where(
            and(
              inArray(practiceSessions.skillId, skillIds),
              gte(practiceSessions.occurredAt, new Date(startISO)),
              lt(practiceSessions.occurredAt, new Date(endISO)),
            ),
          )
          .orderBy(asc(practiceSessions.occurredAt));

  const bySkill = new Map<string, FocusSession[]>();
  for (const s of sessions) {
    const arr = bySkill.get(s.skillId) ?? [];
    arr.push({
      id: s.id,
      occurredAt: s.occurredAt.toISOString(),
      durationMinutes: s.durationMinutes,
    });
    bySkill.set(s.skillId, arr);
  }

  return {
    focusSkills: focus.map((f) => ({
      skillId: f.skillId,
      name: f.name,
      goalId: f.goalId,
      goalName: f.goalName,
      position: f.position,
      sessions: bySkill.get(f.skillId) ?? [],
    })),
  };
}
