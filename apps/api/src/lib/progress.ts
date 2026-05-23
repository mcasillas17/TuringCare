import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { practiceSessions, trainingGoals, trainingSkills } from "../db/schema";

export type ProgressSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
};

export type ProgressSkill = {
  id: string;
  name: string;
  confidence: number;
  position: number;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  lastNote: string | null;
  sessions: ProgressSession[];
};

export type ProgressGoal = {
  id: string;
  goal: string;
  avgConfidence: number | null;
  skills: ProgressSkill[];
};

export type ProgressOverview = {
  goals: ProgressGoal[];
};

export async function loadProgress(dogId: string): Promise<ProgressOverview> {
  const goals = await db
    .select()
    .from(trainingGoals)
    .where(eq(trainingGoals.dogId, dogId))
    .orderBy(asc(trainingGoals.createdAt));
  const goalIds = goals.map((goal) => goal.id);
  if (goalIds.length === 0) return { goals: [] };

  const skills = await db
    .select()
    .from(trainingSkills)
    .where(inArray(trainingSkills.goalId, goalIds))
    .orderBy(
      asc(trainingSkills.goalId),
      asc(trainingSkills.position),
      asc(trainingSkills.createdAt),
    );
  const skillIds = skills.map((skill) => skill.id);

  const sessions =
    skillIds.length === 0
      ? []
      : await db
          .select()
          .from(practiceSessions)
          .where(inArray(practiceSessions.skillId, skillIds))
          .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.createdAt));

  const sessionsBySkill = new Map<string, ProgressSession[]>();
  for (const session of sessions) {
    const existing = sessionsBySkill.get(session.skillId) ?? [];
    existing.push({
      id: session.id,
      occurredAt: session.occurredAt.toISOString(),
      durationMinutes: session.durationMinutes,
      notes: session.notes,
      createdAt: session.createdAt.toISOString(),
    });
    sessionsBySkill.set(session.skillId, existing);
  }

  const skillsByGoal = new Map<string, ProgressSkill[]>();
  for (const skill of skills) {
    const skillSessions = sessionsBySkill.get(skill.id) ?? [];
    const [lastSession] = skillSessions;
    const firstSession = skillSessions.at(-1);
    const existing = skillsByGoal.get(skill.goalId) ?? [];
    existing.push({
      id: skill.id,
      name: skill.name,
      confidence: skill.confidence,
      position: skill.position,
      sessionCount: skillSessions.length,
      firstSessionAt: firstSession?.occurredAt ?? null,
      lastSessionAt: lastSession?.occurredAt ?? null,
      lastNote: lastSession?.notes ?? null,
      sessions: skillSessions.slice(0, 5),
    });
    skillsByGoal.set(skill.goalId, existing);
  }

  return {
    goals: goals.map((goal) => {
      const goalSkills = skillsByGoal.get(goal.id) ?? [];
      const avgConfidence =
        goalSkills.length === 0
          ? null
          : Number(
              (
                goalSkills.reduce((sum, skill) => sum + skill.confidence, 0) / goalSkills.length
              ).toFixed(1),
            );
      return {
        id: goal.id,
        goal: goal.goal,
        avgConfidence,
        skills: goalSkills,
      };
    }),
  };
}
