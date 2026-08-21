import type { ContextualProgressSummary, PracticeDimension } from "@turingcare/shared";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { skillDimensionMetadata } from "../data/training-curriculum";
import { db } from "../db";
import {
  focusCompatibilityWeeks,
  legacyFocusClaims,
  practiceSessions,
  trainingGoals,
  trainingSkills,
  weeklyFocus,
} from "../db/schema";
import { classifyExceptionValue } from "../monitoring/sanitize-event";
import { loadContextualProgressSummaries } from "./contextual-progress-data";
import type { TransactionType } from "./safety-lock";
import { evaluateSafetyWithLock } from "./safety-policy";

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
  currentLevel: number;
  dimensions: PracticeDimension[];
  contextualProgress:
    | { status: "ready"; summary: ContextualProgressSummary }
    | { status: "unavailable" };
};

export class FocusSkillDogMismatchError extends Error {
  declare readonly dogId: string;
  declare readonly skillId: string;

  constructor(dogId: string, skillId: string) {
    super("focus skill does not belong to dog");
    this.name = "FocusSkillDogMismatchError";
    Object.defineProperties(this, {
      dogId: {
        value: dogId,
        enumerable: false,
        configurable: false,
        writable: false,
      },
      skillId: {
        value: skillId,
        enumerable: false,
        configurable: false,
        writable: false,
      },
    });
  }
}

export function weekBoundsFromOffset(
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
) {
  const startBase = Date.parse(`${weekKey}T00:00:00.000Z`);
  const endBase = startBase + 7 * 24 * 60 * 60 * 1000;
  return {
    startISO: new Date(startBase + timezoneOffsetMinutes * 60_000).toISOString(),
    endISO: new Date(endBase + weekEndTimezoneOffsetMinutes * 60_000).toISOString(),
  };
}

export async function loadFocusWeek(
  dogId: string,
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
): Promise<{ focusSkills: FocusSkill[] }> {
  const { startISO, endISO } = weekBoundsFromOffset(
    weekKey,
    timezoneOffsetMinutes,
    weekEndTimezoneOffsetMinutes,
  );
  const focus = await db
    .select({
      skillId: weeklyFocus.skillId,
      position: weeklyFocus.position,
      createdAt: weeklyFocus.createdAt,
      name: trainingSkills.name,
      goalId: trainingSkills.goalId,
      goalName: trainingGoals.goal,
      confidence: trainingSkills.confidence,
      catalogSkillKey: trainingSkills.catalogSkillKey,
    })
    .from(weeklyFocus)
    .innerJoin(trainingSkills, eq(weeklyFocus.skillId, trainingSkills.id))
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
    .orderBy(asc(weeklyFocus.position), asc(weeklyFocus.createdAt));

  const skillIds = focus.map((f) => f.skillId);
  const sessionsPromise =
    skillIds.length === 0
      ? Promise.resolve([])
      : db
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
  const now = new Date();
  const summariesPromise =
    focus.length === 0
      ? Promise.resolve(new Map<string, ContextualProgressSummary>())
      : evaluateSafetyWithLock(dogId, now, async (safety, tx) => {
          try {
            // Keep a failed evidence read local so the outer safety lock can still commit.
            return await tx.transaction((summaryTx) =>
              loadContextualProgressSummaries(
                focus.map((focusedSkill) => ({
                  id: focusedSkill.skillId,
                  confidence: focusedSkill.confidence,
                  catalogSkillKey: focusedSkill.catalogSkillKey,
                })),
                now,
                safety,
                summaryTx,
              ),
            );
          } catch (error) {
            const errorType = error instanceof Error ? error.constructor.name : undefined;
            console.error("[contextual-progress] focus_summary_failed", {
              dogId,
              weekKey,
              errorType: classifyExceptionValue(errorType),
            });
            return null;
          }
        });
  const [sessions, summaries] = await Promise.all([sessionsPromise, summariesPromise]);

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
      currentLevel: f.confidence,
      dimensions: f.catalogSkillKey
        ? (skillDimensionMetadata[f.catalogSkillKey]?.dimensions ?? [])
        : [],
      contextualProgress: summaries
        ? {
            status: "ready" as const,
            summary: summaries.get(f.skillId) ?? {
              strongestContext: null,
              nextPracticeAction: null,
              safety: null,
            },
          }
        : { status: "unavailable" as const },
    })),
  };
}

async function lockFocusWeek(tx: Pick<typeof db, "execute">, dogId: string, weekKey: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`legacy-focus:${dogId}`}))`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${dogId}:${weekKey}`}))`);
}

export async function setWeeklyFocus(
  executor: TransactionType,
  dogId: string,
  skillId: string,
  weekKey: string,
) {
  const [ownedSkill] = await executor
    .select({ id: trainingSkills.id })
    .from(trainingSkills)
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .where(and(eq(trainingSkills.id, skillId), eq(trainingGoals.dogId, dogId)))
    .limit(1);
  if (!ownedSkill) throw new FocusSkillDogMismatchError(dogId, skillId);

  await lockFocusWeek(executor, dogId, weekKey);

  const [existing] = await executor
    .select()
    .from(weeklyFocus)
    .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
    .for("update");

  if (existing?.skillId === skillId) {
    return { kind: "unchanged" as const, focus: existing };
  }
  if (existing) {
    const [focus] = await executor
      .update(weeklyFocus)
      .set({ skillId, position: 0 })
      .where(eq(weeklyFocus.id, existing.id))
      .returning();
    if (!focus) throw new Error("failed to replace focus skill");
    return { kind: "replaced" as const, focus };
  }

  const [focus] = await executor
    .insert(weeklyFocus)
    .values({ dogId, skillId, weekStart: weekKey, position: 0 })
    .returning();
  if (!focus) throw new Error("failed to add focus skill");
  return { kind: "created" as const, focus };
}

export async function claimLegacyFocus(dogId: string, weekKey: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockFocusWeek(tx, dogId, weekKey);
    const claimed = await tx
      .select({ dogId: legacyFocusClaims.dogId })
      .from(legacyFocusClaims)
      .where(eq(legacyFocusClaims.dogId, dogId))
      .for("update");
    if (claimed[0]) return;

    const current = await tx
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), eq(weeklyFocus.weekStart, weekKey)))
      .for("update");
    if (current[0]) {
      await tx
        .insert(legacyFocusClaims)
        .values({ dogId, claimedAt: new Date() })
        .onConflictDoNothing();
      return;
    }

    const [legacy] = await tx
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dogId), isNull(weeklyFocus.weekStart)))
      .orderBy(asc(weeklyFocus.position), asc(weeklyFocus.createdAt), asc(weeklyFocus.id))
      .limit(1)
      .for("update");
    if (!legacy) return;
    await tx.update(weeklyFocus).set({ weekStart: weekKey }).where(eq(weeklyFocus.id, legacy.id));
    await tx
      .insert(legacyFocusClaims)
      .values({ dogId, claimedAt: new Date() })
      .onConflictDoNothing();
  });
}

export async function rememberLegacyFocusWeek(
  dogId: string,
  sessionId: string,
  weekKey: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000);
  await db.delete(focusCompatibilityWeeks).where(lte(focusCompatibilityWeeks.expiresAt, now));
  await db
    .insert(focusCompatibilityWeeks)
    .values({ dogId, sessionId, weekStart: weekKey, expiresAt })
    .onConflictDoUpdate({
      target: [focusCompatibilityWeeks.dogId, focusCompatibilityWeeks.sessionId],
      set: { weekStart: weekKey, expiresAt },
    });
}

export async function legacyFocusWeekKey(dogId: string, sessionId: string): Promise<string | null> {
  const [context] = await db
    .select({ weekStart: focusCompatibilityWeeks.weekStart })
    .from(focusCompatibilityWeeks)
    .where(
      and(
        eq(focusCompatibilityWeeks.dogId, dogId),
        eq(focusCompatibilityWeeks.sessionId, sessionId),
        gt(focusCompatibilityWeeks.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return context?.weekStart ?? null;
}

export async function withFocusWeekLock<T>(
  dogId: string,
  weekKey: string,
  callback: (tx: TransactionType) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockFocusWeek(tx, dogId, weekKey);
    return callback(tx);
  });
}
