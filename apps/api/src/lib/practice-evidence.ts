import type {
  PracticeDistraction,
  PracticeEnvironment,
  PracticeOutcome,
  SuggestionEvidence,
} from "@turingcare/shared";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { practiceSessions } from "../db/schema";

/** How far back structured practice evidence is considered. */
export const EVIDENCE_WINDOW_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EvidenceRow = {
  id?: string;
  outcome: PracticeOutcome | null;
  occurredAt: Date;
  practiceDay?: string;
};

export type EvidenceSummary = SuggestionEvidence & { recentOutcomes: PracticeOutcome[] };

export function summarizeEvidence(rows: EvidenceRow[], now: Date): EvidenceSummary {
  const scored = rows
    .filter(
      (row): row is EvidenceRow & { outcome: PracticeOutcome } =>
        row.outcome !== null && row.occurredAt <= now,
    )
    .sort(
      (a, b) =>
        b.occurredAt.getTime() - a.occurredAt.getTime() || (b.id ?? "").localeCompare(a.id ?? ""),
    );

  const days = new Set(
    scored.map((row) => row.practiceDay ?? row.occurredAt.toISOString().slice(0, 10)),
  );
  const latest = scored[0];

  return {
    windowDays: EVIDENCE_WINDOW_DAYS,
    sessionCount: scored.length,
    wentWellCount: scored.filter((row) => row.outcome === "went_well").length,
    mixedCount: scored.filter((row) => row.outcome === "mixed").length,
    tooHardCount: scored.filter((row) => row.outcome === "too_hard").length,
    distinctDayCount: days.size,
    lastPracticeAt: latest ? latest.occurredAt.toISOString() : null,
    recentOutcomes: scored.map((row) => row.outcome),
  };
}

/**
 * Loads outcomes anchored at the confirmed level or its one-step-easier level.
 * Advancement needs the exact confirmed-level primary target and therefore uses
 * the separate primary-only slice returned below.
 */
export type ScoredRow = {
  id: string;
  outcome: PracticeOutcome;
  occurredAt: Date;
  practiceDay: string;
  practiceVariant: "primary" | "fallback";
  curriculumLevel: number;
  environment: PracticeEnvironment | null;
  distraction: PracticeDistraction | null;
};

export async function loadSkillEvidence(
  skillId: string,
  confirmedLevel: number,
  now: Date,
): Promise<{
  summary: EvidenceSummary;
  rows: ScoredRow[];
  advancementRows: ScoredRow[];
  latestMixedHadChallengingContext: boolean;
}> {
  const cutoff = new Date(now.getTime() - EVIDENCE_WINDOW_DAYS * DAY_MS);
  const rows = await db
    .select({
      id: practiceSessions.id,
      outcome: practiceSessions.outcome,
      occurredAt: practiceSessions.occurredAt,
      practiceDay: practiceSessions.practiceDay,
      practiceVariant: practiceSessions.practiceVariant,
      curriculumLevel: practiceSessions.curriculumLevel,
      environment: practiceSessions.environment,
      distraction: practiceSessions.distraction,
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.skillId, skillId),
        gte(practiceSessions.occurredAt, cutoff),
        lte(practiceSessions.occurredAt, now),
        inArray(practiceSessions.curriculumLevel, [
          confirmedLevel,
          Math.max(1, confirmedLevel - 1),
        ]),
        eq(practiceSessions.curriculumVersion, CURRICULUM_VERSION),
        isNotNull(practiceSessions.practiceDay),
        isNotNull(practiceSessions.practiceVariant),
      ),
    )
    .orderBy(desc(practiceSessions.occurredAt), desc(practiceSessions.id));
  const scored = rows.filter(
    (row): row is ScoredRow =>
      row.outcome !== null &&
      row.practiceDay !== null &&
      row.practiceVariant !== null &&
      row.curriculumLevel !== null,
  );

  return {
    summary: summarizeEvidence(scored, now),
    rows: scored,
    latestMixedHadChallengingContext:
      scored[0]?.outcome === "mixed" &&
      (scored[0].environment === "busy_outdoor" || scored[0].distraction === "strong"),
    advancementRows: scored.filter(
      (row) => row.practiceVariant === "primary" && row.curriculumLevel === confirmedLevel,
    ),
  };
}
