import type { SuggestionAction, SuggestionSafety, TrainingSuggestion } from "@turingcare/shared";
import { and, eq } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import {
  dogs,
  trainingGoals,
  trainingSkills,
  trainingSuggestionActions,
  trainingSuggestions,
  weeklyFocus,
} from "../db/schema";
import { recordEvent } from "../telemetry/record-event";
import {
  evaluateAdvancement,
  syncAdvancementProposal,
  syncAdvancementProposalInTx,
} from "./advancement";
import { resolveCurriculumTarget } from "./curriculum";
import { claimLegacyFocus } from "./focus";
import { loadRecentObservation } from "./observations";
import { isSuggestionSkipped, lockSuggestionAnchor } from "./practice-anchor";
import { EVIDENCE_WINDOW_DAYS, loadSkillEvidence } from "./practice-evidence";
import type { TransactionType } from "./safety-lock";
import { evaluateSafety, evaluateSafetyWithLock } from "./safety-policy";
import { selectSuggestionRule } from "./suggestion-rules";

const EMPTY_EVIDENCE = {
  windowDays: EVIDENCE_WINDOW_DAYS,
  sessionCount: 0,
  wentWellCount: 0,
  mixedCount: 0,
  tooHardCount: 0,
  distinctDayCount: 0,
  lastPracticeAt: null,
};

/**
 * Raised only for audit-table statements, so the fail-open wrapper can tell an
 * audit write failure apart from a safety-input load failure, which must surface.
 */
class SuggestionAuditWriteError extends Error {
  constructor(cause: unknown) {
    super("suggestion audit write failed", { cause });
    this.name = "SuggestionAuditWriteError";
  }
}

export function currentWeekKey(now: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  return local.toISOString().slice(0, 10);
}

async function loadPrimaryFocusSkill(dogId: string, weekKey: string) {
  const [row] = await db
    .select({
      id: trainingSkills.id,
      name: trainingSkills.name,
      catalogSkillKey: trainingSkills.catalogSkillKey,
      level: trainingSkills.confidence,
      goalId: trainingSkills.goalId,
      goalName: trainingGoals.goal,
    })
    .from(weeklyFocus)
    .innerJoin(trainingSkills, eq(weeklyFocus.skillId, trainingSkills.id))
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Persists the suggestion for review and cohort analysis. Runs on the
 * safety-locked transaction and never swallows a failed statement: it has
 * already aborted that transaction, so it is re-thrown for the caller to roll back.
 */
async function recordSuggestion(
  tx: TransactionType,
  input: {
    dogId: string;
    weekKey: string;
    auditDay: string;
    suggestion: TrainingSuggestion;
  },
): Promise<{ suggestionId: string | null; inserted: boolean }> {
  const { suggestion } = input;
  const dedupeKey = [
    input.dogId,
    input.weekKey,
    suggestion.skill?.id ?? "none",
    suggestion.type,
    suggestion.ruleId ?? "none",
    suggestion.primary?.level ?? 0,
    suggestion.safety?.ruleId ?? "no-safety-rule",
    suggestion.safety?.referral ?? "no-referral",
    CURRICULUM_VERSION,
    input.auditDay,
  ].join(":");

  try {
    const [row] = await tx
      .insert(trainingSuggestions)
      .values({
        dogId: input.dogId,
        skillId: suggestion.skill?.id ?? null,
        catalogSkillKey: suggestion.skill?.catalogSkillKey ?? null,
        weekStart: input.weekKey,
        curriculumVersion: CURRICULUM_VERSION,
        suggestionType: suggestion.type,
        ruleId: suggestion.ruleId,
        level: suggestion.primary?.level ?? null,
        fallbackLevel: suggestion.fallback?.level ?? null,
        fallbackDimension: suggestion.fallback?.reducedDimension ?? null,
        fallbackStrategy: suggestion.fallback?.easingStrategy ?? null,
        evidenceCategory: suggestion.evidenceCategory,
        suppressed: suggestion.safety !== null,
        safetyRuleId: suggestion.safety?.ruleId ?? null,
        dedupeKey,
      })
      .onConflictDoNothing({ target: trainingSuggestions.dedupeKey })
      .returning({ id: trainingSuggestions.id });
    if (row) return { suggestionId: row.id, inserted: true };

    const [existing] = await tx
      .select({ id: trainingSuggestions.id })
      .from(trainingSuggestions)
      .where(eq(trainingSuggestions.dedupeKey, dedupeKey))
      .limit(1);
    return { suggestionId: existing?.id ?? null, inserted: false };
  } catch (error) {
    throw new SuggestionAuditWriteError(error);
  }
}

async function persistSuggestionAudit(
  tx: TransactionType,
  input: {
    dogId: string;
    weekKey: string;
    auditDay: string;
    suggestion: TrainingSuggestion;
  },
): Promise<{ suggestionId: string | null; inserted: boolean; dismissed: boolean }> {
  const { suggestionId, inserted } = await recordSuggestion(tx, input);
  try {
    return {
      suggestionId,
      inserted,
      dismissed: suggestionId ? await isSuggestionSkipped(tx, suggestionId) : false,
    };
  } catch (error) {
    throw new SuggestionAuditWriteError(error);
  }
}

/** Side channel only: runs after the audit transaction commits and never throws. */
async function emitAfterCommit(userId: string, suggestion: TrainingSuggestion): Promise<void> {
  try {
    await recordEvent("training.suggestion_shown", {
      userId,
      props: {
        suggestionType: suggestion.type,
        ruleId: suggestion.ruleId ?? "none",
        level: suggestion.primary?.level ?? 0,
        suppressed: suggestion.safety !== null,
        curriculumVersion: CURRICULUM_VERSION,
      },
    });
    if (suggestion.safety) {
      await recordEvent("safety.suppression_shown", {
        userId,
        props: {
          safetyRuleId: suggestion.safety.ruleId,
          referral: suggestion.safety.referral,
        },
      });
    }
  } catch (error) {
    console.error("[suggestion] telemetry_failed", { error });
  }
}

/**
 * Takes the final safety decision and writes the audit rows in one transaction
 * holding the dog safety lock. A recognized audit-write failure rolls back and
 * returns the built suggestion without an audit ID; every other error surfaces.
 */
async function finalizeUnderSafetyLock(input: {
  userId: string;
  dogId: string;
  weekKey: string;
  auditDay: string;
  now: Date;
  build: (decision: SuggestionSafety | null, tx: TransactionType) => Promise<TrainingSuggestion>;
}): Promise<TrainingSuggestion> {
  // A plain `let` would be narrowed to `null`; the holder remains readable from `catch`.
  const state: { built: TrainingSuggestion | null } = { built: null };
  try {
    const { suggestion, inserted } = await evaluateSafetyWithLock(
      input.dogId,
      async (decision, tx) => {
        const built = await input.build(decision, tx);
        state.built = built;
        const audit = await persistSuggestionAudit(tx, {
          dogId: input.dogId,
          weekKey: input.weekKey,
          auditDay: input.auditDay,
          suggestion: built,
        });
        return {
          suggestion: {
            ...built,
            suggestionId: audit.suggestionId,
            dismissed: audit.dismissed,
          },
          inserted: audit.inserted,
        };
      },
    );
    // The audit transaction committed, so telemetry cannot affect it.
    if (inserted) {
      await emitAfterCommit(input.userId, suggestion);
    }
    return suggestion;
  } catch (error) {
    const built = state.built;
    if (!(error instanceof SuggestionAuditWriteError) || !built) throw error;
    console.error("[suggestion] audit_write_failed", {
      dogId: input.dogId,
      suggestionType: built.type,
      suppressed: built.safety !== null,
      error,
    });
    return { ...built, suggestionId: null, dismissed: false };
  }
}

export async function loadSuggestion(input: {
  userId: string;
  dogId: string;
  weekKey: string;
  timezoneOffsetMinutes: number;
  now?: Date;
}): Promise<TrainingSuggestion> {
  const now = input.now ?? new Date();
  const auditDay = new Date(now.getTime() - input.timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
  await claimLegacyFocus(input.dogId, input.weekKey);
  const [focus, safety] = await Promise.all([
    loadPrimaryFocusSkill(input.dogId, input.weekKey),
    evaluateSafety(input.dogId, now),
  ]);
  const skill = focus
    ? {
        id: focus.id,
        name: focus.name,
        catalogSkillKey: focus.catalogSkillKey,
        level: focus.level,
        goalId: focus.goalId,
        goalName: focus.goalName,
      }
    : null;
  const base = {
    suggestionId: null,
    dismissed: false,
    curriculumVersion: CURRICULUM_VERSION,
    dogId: input.dogId,
    weekKey: input.weekKey,
    skill,
    primary: null,
    fallback: null,
    requestedDimensions: [],
    evidenceCategory: null,
    evidence: EMPTY_EVIDENCE,
    safety: null,
    advancementProposal: null,
  } satisfies Omit<TrainingSuggestion, "type" | "ruleId">;
  /**
   * Runs on the safety-locked transaction, so suppression withdrawal takes the
   * skill lock after the dog safety lock and never opens a nested transaction.
   */
  const buildSuppressed = async (
    decision: NonNullable<TrainingSuggestion["safety"]>,
    tx: TransactionType,
  ): Promise<TrainingSuggestion> => {
    if (focus) await syncAdvancementProposalInTx(tx, focus.id, null, []);
    return { ...base, type: "safety_suppressed", ruleId: null, safety: decision };
  };

  if (safety) {
    return finalizeUnderSafetyLock({
      userId: input.userId,
      dogId: input.dogId,
      weekKey: input.weekKey,
      auditDay,
      now,
      build: (decision, tx) => buildSuppressed(decision ?? safety, tx),
    });
  }

  const evidence = focus
    ? await loadSkillEvidence(focus.id, focus.level, now)
    : {
        summary: { ...EMPTY_EVIDENCE, recentOutcomes: [] },
        rows: [],
        advancementRows: [],
        latestMixedHadChallengingContext: false,
      };
  const observation = await loadRecentObservation(input.dogId, now);
  const lastWentWell = evidence.rows.find((row) => row.outcome === "went_well");
  const rule = selectSuggestionRule({
    now,
    hasFocusSkill: focus !== null,
    catalogSkillKey: focus?.catalogSkillKey ?? null,
    level: focus?.level ?? 1,
    recentOutcomes: evidence.summary.recentOutcomes,
    latestMixedHadChallengingContext: evidence.latestMixedHadChallengingContext,
    lastWentWellAt: lastWentWell?.occurredAt ?? null,
    observation,
  });
  const target =
    rule.effectiveLevel === null
      ? null
      : resolveCurriculumTarget(focus?.catalogSkillKey ?? null, rule.effectiveLevel);

  if (!target) {
    const unsupported: TrainingSuggestion = {
      ...base,
      type: rule.type === "exercise" ? "custom_skill_unsupported" : rule.type,
      ruleId: rule.type === "exercise" ? "custom_skill_unsupported" : rule.ruleId,
      evidence: {
        windowDays: evidence.summary.windowDays,
        sessionCount: evidence.summary.sessionCount,
        wentWellCount: evidence.summary.wentWellCount,
        mixedCount: evidence.summary.mixedCount,
        tooHardCount: evidence.summary.tooHardCount,
        distinctDayCount: evidence.summary.distinctDayCount,
        lastPracticeAt: evidence.summary.lastPracticeAt,
      },
    };
    return finalizeUnderSafetyLock({
      userId: input.userId,
      dogId: input.dogId,
      weekKey: input.weekKey,
      auditDay,
      now,
      build: async (decision, tx) => (decision ? buildSuppressed(decision, tx) : unsupported),
    });
  }

  // This wrapper commits before taking the safety lock, preserving dog safety → skill order.
  const advancement = focus
    ? await syncAdvancementProposal(
        focus.id,
        evaluateAdvancement({
          ruleId: rule.ruleId,
          level: focus.level,
          outcomes: evidence.advancementRows,
        }),
        evidence.advancementRows,
      )
    : { proposal: null, created: false };
  if (advancement.proposal && advancement.created) {
    await recordEvent("training.advancement_proposed", {
      userId: input.userId,
      props: {
        fromLevel: advancement.proposal.fromLevel,
        toLevel: advancement.proposal.toLevel,
        sessionCount: advancement.proposal.sessionCount,
        dayCount: advancement.proposal.dayCount,
      },
    });
  }
  const suggestion: TrainingSuggestion = {
    ...base,
    type: "exercise",
    ruleId: rule.ruleId,
    primary: target.primary,
    fallback: target.fallback,
    requestedDimensions: target.requestedDimensions,
    evidenceCategory: rule.evidenceCategory,
    evidence: {
      windowDays: evidence.summary.windowDays,
      sessionCount: evidence.summary.sessionCount,
      wentWellCount: evidence.summary.wentWellCount,
      mixedCount: evidence.summary.mixedCount,
      tooHardCount: evidence.summary.tooHardCount,
      distinctDayCount: evidence.summary.distinctDayCount,
      lastPracticeAt: evidence.summary.lastPracticeAt,
    },
    advancementProposal: advancement.proposal,
  };
  return finalizeUnderSafetyLock({
    userId: input.userId,
    dogId: input.dogId,
    weekKey: input.weekKey,
    auditDay,
    now,
    build: async (decision, tx) => (decision ? buildSuppressed(decision, tx) : suggestion),
  });
}

export async function recordSuggestionAction(input: {
  userId: string;
  dogId: string;
  suggestionId: string;
  action: SuggestionAction;
}): Promise<"recorded" | "not_found" | "dismissed"> {
  const result = await db.transaction(async (tx) => {
    await lockSuggestionAnchor(tx, input.suggestionId);
    const [owned] = await tx
      .select({ id: trainingSuggestions.id, ruleId: trainingSuggestions.ruleId })
      .from(trainingSuggestions)
      .innerJoin(dogs, eq(trainingSuggestions.dogId, dogs.id))
      .where(
        and(
          eq(trainingSuggestions.id, input.suggestionId),
          eq(trainingSuggestions.dogId, input.dogId),
          eq(dogs.ownerId, input.userId),
        ),
      )
      .limit(1);
    if (!owned) return { kind: "not_found" as const };
    if (input.action !== "skipped" && (await isSuggestionSkipped(tx, input.suggestionId))) {
      return { kind: "dismissed" as const };
    }
    const [inserted] = await tx
      .insert(trainingSuggestionActions)
      .values({ suggestionId: owned.id, action: input.action })
      .onConflictDoNothing({
        target: [trainingSuggestionActions.suggestionId, trainingSuggestionActions.action],
      })
      .returning({ id: trainingSuggestionActions.id });
    return { kind: "recorded" as const, inserted, ruleId: owned.ruleId };
  });
  if (result.kind !== "recorded") return result.kind;
  if (result.inserted) {
    await recordEvent("training.suggestion_action", {
      userId: input.userId,
      props: { action: input.action, ruleId: result.ruleId ?? "none" },
    });
  }
  return "recorded";
}
