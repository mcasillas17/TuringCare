import type {
  AdvancementDecision,
  AdvancementProposalDto,
  PracticeOutcome,
  SuggestionRule,
} from "@turingcare/shared";
import { advancementRuleId } from "@turingcare/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { advancementProposals, practiceSessions, trainingSkills } from "../db/schema";
import { MAX_LEVEL, clampLevel } from "./curriculum";
import { EVIDENCE_WINDOW_DAYS } from "./practice-evidence";
import { type TransactionType, lockDogSafety } from "./safety-lock";
import { decideSafety, loadSafetyInputs } from "./safety-policy";
import { setSkillLevel } from "./skill-level";

export const ADVANCEMENT_MIN_SESSIONS = 3;
export const ADVANCEMENT_MIN_DAYS = 2;

export type AdvancementInputs = {
  ruleId: SuggestionRule;
  level: number;
  /** Newest first, already filtered to the skill's current level. */
  outcomes: {
    id?: string;
    outcome: PracticeOutcome;
    occurredAt: Date;
    practiceDay?: string;
  }[];
};

export type AdvancementEvidence = {
  fromLevel: number;
  toLevel: number;
  sessionCount: number;
  dayCount: number;
  lastSessionAt: Date;
  lastSessionId: string | null;
};

export function evaluateAdvancement(inputs: AdvancementInputs): AdvancementEvidence | null {
  if (inputs.ruleId !== "maintain_current_level") return null;
  const level = clampLevel(inputs.level);
  if (level >= MAX_LEVEL || inputs.outcomes.length < ADVANCEMENT_MIN_SESSIONS) return null;

  const recent = inputs.outcomes.slice(0, ADVANCEMENT_MIN_SESSIONS);
  if (!recent.every((row) => row.outcome === "went_well")) return null;
  const newest = recent[0];
  if (!newest) return null;

  const days = new Set(
    recent.map((row) => row.practiceDay ?? row.occurredAt.toISOString().slice(0, 10)),
  );
  if (days.size < ADVANCEMENT_MIN_DAYS) return null;

  return {
    fromLevel: level,
    toLevel: level + 1,
    sessionCount: recent.length,
    dayCount: days.size,
    lastSessionAt: newest.occurredAt,
    lastSessionId: newest.id ?? null,
  };
}

function toDto(row: typeof advancementProposals.$inferSelect): AdvancementProposalDto {
  const arrays = [
    row.evidenceSessionIds,
    row.evidenceOccurredAt,
    row.evidencePracticeDays,
    row.evidenceOutcomes,
  ];
  if (!arrays.every((array) => array.length === row.evidenceSessionIds.length)) {
    throw new Error("advancement proposal evidence snapshot is inconsistent");
  }

  const supportingSessions: AdvancementProposalDto["supportingSessions"] = [];
  for (let index = 0; index < row.evidenceSessionIds.length; index++) {
    const id = row.evidenceSessionIds[index];
    const occurredAt = row.evidenceOccurredAt[index];
    const practiceDay = row.evidencePracticeDays[index];
    const outcome = row.evidenceOutcomes[index];
    if (!id || !occurredAt || !practiceDay || !outcome) {
      throw new Error("advancement proposal evidence snapshot is incomplete");
    }
    supportingSessions.push({ id, occurredAt: occurredAt.toISOString(), practiceDay, outcome });
  }

  return {
    id: row.id,
    skillId: row.skillId,
    fromLevel: row.fromLevel,
    toLevel: row.toLevel,
    ruleId: advancementRuleId,
    status: row.status,
    sessionCount: row.evidenceSessionCount,
    dayCount: row.evidenceDayCount,
    windowDays: row.evidenceWindowDays,
    supportingSessions,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

type EvidenceRow = {
  id: string;
  outcome: PracticeOutcome;
  occurredAt: Date;
  practiceDay: string;
};

async function withdrawOpenProposal(
  tx: TransactionType,
  open: typeof advancementProposals.$inferSelect | undefined,
): Promise<void> {
  if (!open) return;
  await tx
    .update(advancementProposals)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(eq(advancementProposals.id, open.id));
}

/**
 * Synchronizes a proposal using the caller's transaction. Callers that already
 * hold the dog safety lock must use this instead of opening a nested transaction.
 */
export async function syncAdvancementProposalInTx(
  tx: TransactionType,
  skillId: string,
  evidence: AdvancementEvidence | null,
  evidenceRows: EvidenceRow[],
): Promise<{ proposal: AdvancementProposalDto | null; created: boolean }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
  const [skill] = await tx
    .select({ confidence: trainingSkills.confidence })
    .from(trainingSkills)
    .where(eq(trainingSkills.id, skillId))
    .for("update")
    .limit(1);
  if (!skill) return { proposal: null, created: false };

  const [open] = await tx
    .select()
    .from(advancementProposals)
    .where(
      and(eq(advancementProposals.skillId, skillId), eq(advancementProposals.status, "proposed")),
    )
    .limit(1);

  if (!evidence || skill.confidence !== evidence.fromLevel) {
    await withdrawOpenProposal(tx, open);
    return { proposal: null, created: false };
  }

  const qualifying = evidenceRows.slice(0, ADVANCEMENT_MIN_SESSIONS);
  const persisted =
    qualifying.length === ADVANCEMENT_MIN_SESSIONS
      ? await tx
          .select({
            id: practiceSessions.id,
            outcome: practiceSessions.outcome,
            occurredAt: practiceSessions.occurredAt,
            practiceDay: practiceSessions.practiceDay,
            curriculumLevel: practiceSessions.curriculumLevel,
            practiceVariant: practiceSessions.practiceVariant,
          })
          .from(practiceSessions)
          .where(
            inArray(
              practiceSessions.id,
              qualifying.map((row) => row.id),
            ),
          )
      : [];
  const persistedById = new Map(persisted.map((row) => [row.id, row]));
  const snapshotStillValid =
    qualifying.length === ADVANCEMENT_MIN_SESSIONS &&
    qualifying.every((row) => {
      const saved = persistedById.get(row.id);
      return (
        saved?.outcome === "went_well" &&
        saved.outcome === row.outcome &&
        saved.occurredAt.getTime() === row.occurredAt.getTime() &&
        saved.practiceDay === row.practiceDay &&
        saved.curriculumLevel === evidence.fromLevel &&
        saved.practiceVariant === "primary"
      );
    });
  if (!snapshotStillValid) {
    await withdrawOpenProposal(tx, open);
    return { proposal: null, created: false };
  }

  const sameSnapshot =
    open &&
    open.evidenceSessionIds.length === qualifying.length &&
    open.evidenceSessionIds.every((id, index) => id === qualifying[index]?.id) &&
    open.evidenceOccurredAt.every(
      (occurredAt, index) => occurredAt.getTime() === qualifying[index]?.occurredAt.getTime(),
    ) &&
    open.evidencePracticeDays.every(
      (practiceDay, index) => practiceDay === qualifying[index]?.practiceDay,
    ) &&
    open.evidenceOutcomes.every((outcome, index) => outcome === qualifying[index]?.outcome);
  if (
    open &&
    open.fromLevel === evidence.fromLevel &&
    open.toLevel === evidence.toLevel &&
    sameSnapshot
  ) {
    return { proposal: toDto(open), created: false };
  }

  await withdrawOpenProposal(tx, open);

  const [latestDecision] = await tx
    .select()
    .from(advancementProposals)
    .where(
      and(
        eq(advancementProposals.skillId, skillId),
        eq(advancementProposals.fromLevel, evidence.fromLevel),
        eq(advancementProposals.toLevel, evidence.toLevel),
        inArray(advancementProposals.status, [
          "stayed",
          "rejected",
          "regressed",
          "insufficient_evidence",
        ]),
      ),
    )
    .orderBy(desc(advancementProposals.evidenceLastSessionAt), desc(advancementProposals.createdAt))
    .limit(1);
  const latestDecisionCoversEvidence =
    latestDecision &&
    (latestDecision.evidenceLastSessionAt.getTime() > evidence.lastSessionAt.getTime() ||
      (latestDecision.evidenceLastSessionAt.getTime() === evidence.lastSessionAt.getTime() &&
        (evidence.lastSessionId === null ||
          latestDecision.evidenceSessionIds.includes(evidence.lastSessionId))));
  if (latestDecisionCoversEvidence) return { proposal: null, created: false };

  const [created] = await tx
    .insert(advancementProposals)
    .values({
      skillId,
      fromLevel: evidence.fromLevel,
      toLevel: evidence.toLevel,
      ruleId: advancementRuleId,
      evidenceSessionCount: evidence.sessionCount,
      evidenceDayCount: evidence.dayCount,
      evidenceWindowDays: EVIDENCE_WINDOW_DAYS,
      evidenceSessionIds: qualifying.map((row) => row.id),
      evidenceOccurredAt: qualifying.map((row) => row.occurredAt),
      evidencePracticeDays: qualifying.map((row) => row.practiceDay),
      evidenceOutcomes: qualifying.map((row) => row.outcome),
      evidenceLastSessionAt: evidence.lastSessionAt,
    })
    .returning();
  return created ? { proposal: toDto(created), created: true } : { proposal: null, created: false };
}

export async function syncAdvancementProposal(
  skillId: string,
  evidence: AdvancementEvidence | null,
  evidenceRows: EvidenceRow[],
): Promise<{ proposal: AdvancementProposalDto | null; created: boolean }> {
  return db.transaction((tx) => syncAdvancementProposalInTx(tx, skillId, evidence, evidenceRows));
}

export async function decideAdvancementProposal(
  dogId: string,
  proposalId: string,
  skillId: string,
  decision: AdvancementDecision,
): Promise<
  | { status: "decided"; proposal: AdvancementProposalDto }
  | { status: "stale" }
  | { status: "safety_suppressed" }
  | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    await lockDogSafety(tx, dogId);
    if (decideSafety(await loadSafetyInputs(dogId, new Date(), tx))) {
      return { status: "safety_suppressed" as const };
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skillId}))`);
    const [skill] = await tx
      .select({ confidence: trainingSkills.confidence })
      .from(trainingSkills)
      .where(eq(trainingSkills.id, skillId))
      .for("update")
      .limit(1);
    if (!skill) return { status: "not_found" as const };

    const [proposal] = await tx
      .select()
      .from(advancementProposals)
      .where(
        and(eq(advancementProposals.id, proposalId), eq(advancementProposals.skillId, skillId)),
      )
      .for("update")
      .limit(1);
    if (!proposal) return { status: "not_found" as const };
    if (proposal.status === "withdrawn") return { status: "stale" as const };
    if (proposal.status !== "proposed") return { status: "not_found" as const };
    if (skill.confidence !== proposal.fromLevel) {
      await withdrawOpenProposal(tx, proposal);
      return { status: "stale" as const };
    }

    const supporting = await tx
      .select({
        id: practiceSessions.id,
        outcome: practiceSessions.outcome,
        occurredAt: practiceSessions.occurredAt,
        practiceDay: practiceSessions.practiceDay,
        curriculumLevel: practiceSessions.curriculumLevel,
        curriculumVersion: practiceSessions.curriculumVersion,
        practiceVariant: practiceSessions.practiceVariant,
      })
      .from(practiceSessions)
      .where(inArray(practiceSessions.id, proposal.evidenceSessionIds));
    const byId = new Map(supporting.map((row) => [row.id, row]));
    const evidenceStillValid = proposal.evidenceSessionIds.every((id, index) => {
      const session = byId.get(id);
      return (
        session?.outcome === "went_well" &&
        session.outcome === proposal.evidenceOutcomes[index] &&
        session.occurredAt.getTime() === proposal.evidenceOccurredAt[index]?.getTime() &&
        session.practiceDay === proposal.evidencePracticeDays[index] &&
        session.curriculumLevel === proposal.fromLevel &&
        session.curriculumVersion === CURRICULUM_VERSION &&
        session.practiceVariant === "primary"
      );
    });
    if (!evidenceStillValid) {
      await withdrawOpenProposal(tx, proposal);
      return { status: "stale" as const };
    }

    const [updated] = await tx
      .update(advancementProposals)
      .set({ status: decision, decidedAt: new Date() })
      .where(eq(advancementProposals.id, proposal.id))
      .returning();
    if (!updated) return { status: "not_found" as const };

    if (decision === "confirmed") {
      await setSkillLevel(skillId, clampLevel(updated.toLevel), tx);
    } else if (decision === "regressed") {
      await setSkillLevel(skillId, clampLevel(updated.fromLevel - 1), tx);
    }
    return { status: "decided" as const, proposal: toDto(updated) };
  });
}
