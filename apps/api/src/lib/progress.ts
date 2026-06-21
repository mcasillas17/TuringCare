import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { practiceSessions, skillMilestones, trainingGoals, trainingSkills } from "../db/schema";

export type ProgressSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
};

export type ProgressMilestone = { level: number; reachedAt: string };

export type ProgressSkill = {
  id: string;
  name: string;
  confidence: number;
  position: number;
  catalogSkillKey: string | null;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  lastNote: string | null;
  sessions: ProgressSession[];
  milestones: ProgressMilestone[];
};

export type ProgressGoal = {
  id: string;
  goal: string;
  catalogGoalKey: string | null;
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

  const milestoneRows =
    skillIds.length === 0
      ? []
      : await db
          .select()
          .from(skillMilestones)
          .where(inArray(skillMilestones.skillId, skillIds))
          .orderBy(asc(skillMilestones.level));
  const milestonesBySkill = new Map<string, ProgressMilestone[]>();
  for (const row of milestoneRows) {
    const existing = milestonesBySkill.get(row.skillId) ?? [];
    existing.push({ level: row.level, reachedAt: row.reachedAt.toISOString() });
    milestonesBySkill.set(row.skillId, existing);
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
      catalogSkillKey: skill.catalogSkillKey,
      sessionCount: skillSessions.length,
      firstSessionAt: firstSession?.occurredAt ?? null,
      lastSessionAt: lastSession?.occurredAt ?? null,
      lastNote: lastSession?.notes ?? null,
      sessions: skillSessions.slice(0, 5),
      milestones: milestonesBySkill.get(skill.id) ?? [],
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
        catalogGoalKey: goal.catalogGoalKey,
        avgConfidence,
        skills: goalSkills,
      };
    }),
  };
}
