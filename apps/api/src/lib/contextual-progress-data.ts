import type { ContextualProgress } from "@turingcare/shared";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { CURRICULUM_VERSION, skillDimensionMetadata } from "../data/training-curriculum";
import { db } from "../db";
import { practiceSessions, type trainingSkills } from "../db/schema";
import {
  CONTEXTUAL_PROGRESS_WINDOW_DAYS,
  type ContextualProgressRow,
  deriveContextualProgress,
} from "./contextual-progress";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadContextualProgress(
  skill: Pick<typeof trainingSkills.$inferSelect, "id" | "confidence" | "catalogSkillKey">,
  now: Date,
): Promise<ContextualProgress> {
  const startsAt = new Date(now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * DAY_MS);
  const rows: ContextualProgressRow[] = await db
    .select({
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
    })
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
