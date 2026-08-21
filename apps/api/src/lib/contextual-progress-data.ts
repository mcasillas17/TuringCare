import type { ContextualProgress, ContextualProgressSummary } from "@turingcare/shared";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { CURRICULUM_VERSION, skillDimensionMetadata } from "../data/training-curriculum";
import { db } from "../db";
import { practiceSessions, type trainingSkills } from "../db/schema";
import {
  CONTEXTUAL_PROGRESS_WINDOW_DAYS,
  type ContextualProgressRow,
  deriveContextualProgress,
} from "./contextual-progress";

const DAY_MS = 24 * 60 * 60 * 1000;

const contextualProgressColumns = {
  id: practiceSessions.id,
  outcome: practiceSessions.outcome,
  occurredAt: practiceSessions.occurredAt,
  practiceDay: practiceSessions.practiceDay,
  curriculumLevel: practiceSessions.curriculumLevel,
  curriculumVersion: practiceSessions.curriculumVersion,
  cueSupport: practiceSessions.cueSupport,
  environment: practiceSessions.environment,
  distance: practiceSessions.distance,
  durationBand: practiceSessions.durationBand,
  distraction: practiceSessions.distraction,
};

export async function loadContextualProgress(
  skill: Pick<typeof trainingSkills.$inferSelect, "id" | "confidence" | "catalogSkillKey">,
  now: Date,
): Promise<ContextualProgress> {
  const startsAt = new Date(now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * DAY_MS);
  const rows: ContextualProgressRow[] = await db
    .select(contextualProgressColumns)
    .from(practiceSessions)
    .where(
      // Keep SQL eligibility a superset of pure policy; pure policy intentionally drops all-null contexts.
      and(
        eq(practiceSessions.skillId, skill.id),
        gte(practiceSessions.occurredAt, startsAt),
        lte(practiceSessions.occurredAt, now),
        eq(practiceSessions.curriculumLevel, skill.confidence),
        eq(practiceSessions.curriculumVersion, CURRICULUM_VERSION),
        isNotNull(practiceSessions.outcome),
        isNotNull(practiceSessions.practiceDay),
      ),
    )
    .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.id));

  const metadata = skill.catalogSkillKey
    ? (skillDimensionMetadata[skill.catalogSkillKey] ?? null)
    : null;

  return deriveContextualProgress({
    now,
    curriculumLevel: skill.confidence,
    curriculumVersion: CURRICULUM_VERSION,
    catalogSkillKey: skill.catalogSkillKey,
    metadata,
    rows,
  });
}

export async function loadContextualProgressSummaries(
  skills: Array<Pick<typeof trainingSkills.$inferSelect, "id" | "confidence" | "catalogSkillKey">>,
  now: Date,
): Promise<Map<string, ContextualProgressSummary>> {
  const summaries = new Map<string, ContextualProgressSummary>();
  if (skills.length === 0) return summaries;

  const startsAt = new Date(now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * DAY_MS);
  const skillIds = skills.map((skill) => skill.id);
  const rows = await db
    .select({
      skillId: practiceSessions.skillId,
      ...contextualProgressColumns,
    })
    .from(practiceSessions)
    .where(
      and(
        inArray(practiceSessions.skillId, skillIds),
        gte(practiceSessions.occurredAt, startsAt),
        lte(practiceSessions.occurredAt, now),
        isNotNull(practiceSessions.outcome),
        isNotNull(practiceSessions.practiceDay),
      ),
    )
    .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.id));

  const rowsBySkill = new Map<string, ContextualProgressRow[]>(
    skillIds.map((skillId) => [skillId, []]),
  );
  for (const row of rows) {
    const skillRows = rowsBySkill.get(row.skillId);
    if (!skillRows) continue;
    skillRows.push({
      id: row.id,
      outcome: row.outcome,
      occurredAt: row.occurredAt,
      practiceDay: row.practiceDay,
      curriculumLevel: row.curriculumLevel,
      curriculumVersion: row.curriculumVersion,
      cueSupport: row.cueSupport,
      environment: row.environment,
      distance: row.distance,
      durationBand: row.durationBand,
      distraction: row.distraction,
    });
  }

  for (const skill of skills) {
    const metadata = skill.catalogSkillKey
      ? (skillDimensionMetadata[skill.catalogSkillKey] ?? null)
      : null;
    const progress = deriveContextualProgress({
      now,
      curriculumLevel: skill.confidence,
      curriculumVersion: CURRICULUM_VERSION,
      catalogSkillKey: skill.catalogSkillKey,
      metadata,
      rows: rowsBySkill.get(skill.id) ?? [],
    });
    summaries.set(skill.id, {
      strongestContext: progress.strongestContext,
      nextPracticeAction: progress.nextPracticeAction,
    });
  }

  return summaries;
}
