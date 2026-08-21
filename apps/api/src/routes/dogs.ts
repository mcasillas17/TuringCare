import { randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
  advancementDecisionSchema,
  behaviorConcernSchema,
  briefGenerateSchema,
  briefSendSchema,
  dogProfileSchema,
  goalFromTemplateSchema,
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  focusAddSchema as newFocusAddSchema,
  focusRemoveQuerySchema as newFocusRemoveQuerySchema,
  focusWeekQuerySchema as newFocusWeekQuerySchema,
  practiceEvidenceSchema,
  practiceSessionApiSchema,
  skillLevelSchema,
  suggestionActionSchema,
  suggestionQuerySchema,
  trainingGoalSchema,
  trainingSkillSchema,
} from "@turingcare/shared";
import { and, count, desc, eq, gte, isNull, lt, max, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { findOwnedDog } from "../db/owned-dog";
import { findOwnedSkill } from "../db/owned-skill";
import {
  advancementProposals,
  behaviorConcerns,
  briefSends,
  briefs,
  dogSafetySignals,
  dogs,
  guidedSetups,
  journalEntries,
  practiceSessions,
  trainingGoals,
  trainingSkills,
  user,
  weeklyFocus,
} from "../db/schema";
import { renderBriefEmail } from "../email/brief-email";
import { sendEmail } from "../email/send-email";
import { env } from "../env";
import { decideAdvancementProposal } from "../lib/advancement";
import { createBehaviorConcern } from "../lib/behavior-concern-writes";
import { composeBrief } from "../lib/brief";
import { createDog } from "../lib/dog-writes";
import { loadDogsOverview } from "../lib/dogs-overview";
import {
  claimLegacyFocus,
  legacyFocusWeekKey,
  loadFocusWeek,
  rememberLegacyFocusWeek,
  setWeeklyFocus,
  weekBoundsFromOffset,
  withFocusWeekLock,
} from "../lib/focus";
import { InvalidJournalOccurredAtError, createJournalEntry } from "../lib/journal-writes";
import {
  isSuggestionSkipped,
  lockSuggestionAnchor,
  resolvePracticeTargetAudit,
} from "../lib/practice-anchor";
import { loadProgress } from "../lib/progress";
import { lockDogSafety, withDogSafetyLock } from "../lib/safety-lock";
import { setSkillLevel } from "../lib/skill-level";
import { currentWeekKey, loadSuggestion, recordSuggestionAction } from "../lib/suggestion";
import { applyTrainingTemplate } from "../lib/training-template-writes";
import { type Vars, requireUser } from "../middleware/require-user";
import { recordEvent } from "../telemetry/record-event";

const invalidJournalField = (path: "occurredAt" | "trend", message: string) =>
  ({
    success: false,
    error: {
      issues: [{ code: "custom", path: [path], message }],
    },
  }) as const;

function hasConstraint(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("constraint" in error && error.constraint === constraint) return true;
  return "cause" in error && hasConstraint(error.cause, constraint);
}

const legacyFocusWeekQuerySchema = z
  .object({
    weekStart: z.string().datetime({ offset: true }),
    weekEnd: z.string().datetime({ offset: true }),
  })
  .strict();
const legacyFocusAddSchema = z.object({ skillId: z.string().uuid() }).strict();
const legacyFocusRemoveQuerySchema = z.object({}).strict();
const focusWeekCompatSchema = z.union([
  newFocusWeekQuerySchema.strict(),
  legacyFocusWeekQuerySchema,
]);
const focusAddCompatSchema = z.union([newFocusAddSchema.strict(), legacyFocusAddSchema]);
const focusRemoveCompatSchema = z.union([
  newFocusRemoveQuerySchema.strict(),
  legacyFocusRemoveQuerySchema,
]);
const uuidSchema = z.string().uuid();

export const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000;
export const MAX_LEGACY_FUTURE_SKEW_MS = 15 * 60 * 60_000;
export const PRACTICE_TARGET_MAX_AGE_MS = 24 * 60 * 60_000;
const legacyPracticeDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function practiceDay(occurredAt: Date, timezoneOffsetMinutes: number | undefined) {
  if (timezoneOffsetMinutes === undefined) return null;
  return new Date(occurredAt.getTime() - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function resolveConfirmedCurrentLevelAnchor(
  confirmCurrentLevel: true | undefined,
  lockedSkill: typeof trainingSkills.$inferSelect,
  resolvedPracticeDay: string | null,
  existing?: typeof practiceSessions.$inferSelect,
):
  | { kind: "none" }
  | {
      kind: "rejected";
      reason: "practice_day_required" | "target_locked";
    }
  | { kind: "accepted"; level: number; curriculumVersion: string } {
  if (!confirmCurrentLevel) return { kind: "none" };
  if (!resolvedPracticeDay) {
    return { kind: "rejected", reason: "practice_day_required" };
  }
  if (
    existing &&
    (existing.curriculumLevel !== null ||
      existing.curriculumVersion !== null ||
      existing.practiceVariant !== null ||
      existing.suggestionId !== null)
  ) {
    return { kind: "rejected", reason: "target_locked" };
  }
  return {
    kind: "accepted",
    level: lockedSkill.confidence,
    curriculumVersion: CURRICULUM_VERSION,
  };
}

function practiceOccurredAt(value: string) {
  const legacyParts = legacyPracticeDateTime.exec(value);
  const legacy = legacyParts !== null;
  const occurredAt = legacyParts
    ? new Date(
        Number(legacyParts[1]),
        Number(legacyParts[2]) - 1,
        Number(legacyParts[3]),
        Number(legacyParts[4]),
        Number(legacyParts[5]),
      )
    : new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return null;
  if (
    legacyParts &&
    (occurredAt.getFullYear() !== Number(legacyParts[1]) ||
      occurredAt.getMonth() !== Number(legacyParts[2]) - 1 ||
      occurredAt.getDate() !== Number(legacyParts[3]) ||
      occurredAt.getHours() !== Number(legacyParts[4]) ||
      occurredAt.getMinutes() !== Number(legacyParts[5]))
  ) {
    return null;
  }
  const futureLimit = legacy ? MAX_LEGACY_FUTURE_SKEW_MS : MAX_FUTURE_CLOCK_SKEW_MS;
  if (occurredAt.getTime() > Date.now() + futureLimit) return "future" as const;
  return occurredAt;
}

type NormalizedFocusWeek = z.infer<typeof newFocusWeekQuerySchema>;

function legacyWeekInput(input: z.infer<typeof legacyFocusWeekQuerySchema>) {
  const start = new Date(input.weekStart);
  const end = new Date(input.weekEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startDay = start.getUTCDay();
  if (startDay !== 0 && startDay !== 1) return null;
  const monday = new Date(start);
  monday.setUTCHours(0, 0, 0, 0);
  if (startDay === 0) monday.setUTCDate(monday.getUTCDate() + 1);
  const weekKey = monday.toISOString().slice(0, 10);
  const startBase = Date.parse(`${weekKey}T00:00:00.000Z`);
  const endBase = startBase + 7 * 24 * 60 * 60 * 1000;
  const normalized = newFocusWeekQuerySchema.safeParse({
    weekKey,
    timezoneOffsetMinutes: (start.getTime() - startBase) / 60_000,
    weekEndTimezoneOffsetMinutes: (end.getTime() - endBase) / 60_000,
  });
  return normalized.success && "weekKey" in normalized.data ? normalized.data : null;
}

function isCurrentFocusWeek(input: NormalizedFocusWeek) {
  const { startISO, endISO } = weekBoundsFromOffset(
    input.weekKey,
    input.timezoneOffsetMinutes,
    input.weekEndTimezoneOffsetMinutes,
  );
  const now = Date.now();
  return now >= Date.parse(startISO) && now < Date.parse(endISO);
}

/**
 * Builds the 502 thrown when `sendEmail` fails while delivering a brief.
 * Uses `c.json` to construct the *exact* `{ error: "send_failed" }` response
 * previously returned directly, then wraps it as an `HTTPException` so the
 * global monitoring error handler (see monitoring/error-handler.ts) captures
 * and logs it exactly once instead of it bypassing monitoring entirely.
 * `cause` carries the original `sendEmail` failure for monitoring only: the
 * handler never reads `HTTPException#cause` for the client response or for
 * its own structured `console.error` line (see monitoring/log-error.ts), so
 * the original error/provider detail never reaches the client body or logs.
 * Exported so this 502 path can be asserted directly in tests without
 * dynamically re-mocking the whole route module.
 */
export function sendFailedException(c: Context, cause: unknown): HTTPException {
  return new HTTPException(502, { res: c.json({ error: "send_failed" } as const, 502), cause });
}

export const dogsApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(dogs)
      .where(eq(dogs.ownerId, c.get("userId")))
      .orderBy(desc(dogs.createdAt));
    return c.json({ dogs: rows });
  })
  .post("/", zValidator("json", dogProfileSchema), async (c) => {
    const dog = await createDog(db, c.get("userId"), c.req.valid("json"));
    await recordEvent("dog.created", { userId: c.get("userId") });
    return c.json({ dog }, 201);
  })
  .get("/overview", async (c) => {
    return c.json({ dogs: await loadDogsOverview(c.get("userId")) });
  })
  .get("/:id", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [concerns, goals] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
    ]);
    return c.json({ dog, concerns, goals });
  })
  .put("/:id", zValidator("json", dogProfileSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weightLbs, ...body } = c.req.valid("json");
    const [updated] = await db
      .update(dogs)
      .set({
        ...body,
        weightLbs: weightLbs == null ? weightLbs : String(weightLbs),
        updatedAt: new Date(),
      })
      .where(eq(dogs.id, dog.id))
      .returning();
    return c.json({ dog: updated });
  })
  .delete("/:id", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    try {
      const result = await db.transaction(async (tx) => {
        await lockDogSafety(tx, dog.id);

        const [ownedDog] = await tx
          .select({ id: dogs.id })
          .from(dogs)
          .where(and(eq(dogs.id, dog.id), eq(dogs.ownerId, c.get("userId"))))
          .for("update")
          .limit(1);
        if (!ownedDog) return { kind: "not_found" } as const;

        const [activeGuidedSetup] = await tx
          .select({ id: guidedSetups.id })
          .from(guidedSetups)
          .where(and(eq(guidedSetups.dogId, dog.id), isNull(guidedSetups.completedAt)))
          .for("update")
          .limit(1);
        if (activeGuidedSetup) return { kind: "active_guided_setup" } as const;

        const [deleted] = await tx
          .delete(dogs)
          .where(eq(dogs.id, dog.id))
          .returning({ id: dogs.id });
        return deleted ? ({ kind: "deleted" } as const) : ({ kind: "not_found" } as const);
      });
      if (result.kind === "not_found") return c.json({ error: "not_found" } as const, 404);
      if (result.kind === "active_guided_setup") {
        return c.json({ error: "active_guided_setup" } as const, 409);
      }
    } catch (error) {
      if (hasConstraint(error, "guided_setups_active_dog_required")) {
        return c.json({ error: "active_guided_setup" } as const, 409);
      }
      throw error;
    }
    return c.json({ ok: true } as const);
  })
  .post("/:id/concerns", zValidator("json", behaviorConcernSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { concern, reportedSignals } = await db.transaction((tx) =>
      createBehaviorConcern(tx, dog.id, c.req.valid("json")),
    );
    for (const signal of reportedSignals) {
      await recordEvent("safety.signal_reported", {
        userId: c.get("userId"),
        props: { signal, source: "behavior_concern" },
      });
    }
    return c.json({ concern }, 201);
  })
  .delete("/:id/concerns/:concernId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(behaviorConcerns)
      .where(
        and(eq(behaviorConcerns.id, c.req.param("concernId")), eq(behaviorConcerns.dogId, dog.id)),
      );
    return c.json({ ok: true } as const);
  })
  .post("/:id/goals", zValidator("json", trainingGoalSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const body = c.req.valid("json");
    const [goal] = await db
      .insert(trainingGoals)
      .values({ ...body, dogId: dog.id })
      .returning();
    if (!goal) throw new Error("failed to create training goal");
    await recordEvent("training.goal_added", {
      userId: c.get("userId"),
      props: { source: "custom" },
    });
    return c.json({ goal }, 201);
  })
  .post("/:id/goals/from-template", zValidator("json", goalFromTemplateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { templateKey } = c.req.valid("json");
    const applied = await db.transaction((tx) => applyTrainingTemplate(tx, dog.id, templateKey));
    if (!applied) return c.json({ error: "invalid_template" } as const, 400);
    const { goal, skills } = applied;

    await recordEvent("training.goal_added", {
      userId: c.get("userId"),
      props: { source: "template" },
    });
    return c.json({ goal, skills }, 201);
  })
  .delete("/:id/goals/:goalId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(trainingGoals)
      .where(and(eq(trainingGoals.id, c.req.param("goalId")), eq(trainingGoals.dogId, dog.id)));
    return c.json({ ok: true } as const);
  })
  .get("/:id/progress", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    return c.json(await loadProgress(dog.id));
  })
  .post("/:id/goals/:goalId/skills", zValidator("json", trainingSkillSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [goal] = await db
      .select()
      .from(trainingGoals)
      .where(and(eq(trainingGoals.id, c.req.param("goalId")), eq(trainingGoals.dogId, dog.id)))
      .limit(1);
    if (!goal) return c.json({ error: "not_found" } as const, 404);
    const [last] = await db
      .select({ position: max(trainingSkills.position) })
      .from(trainingSkills)
      .where(eq(trainingSkills.goalId, goal.id));
    const [skill] = await db
      .insert(trainingSkills)
      .values({
        ...c.req.valid("json"),
        goalId: goal.id,
        position: (last?.position ?? -1) + 1,
      })
      .returning();
    if (!skill) throw new Error("failed to create skill");
    return c.json({ skill }, 201);
  })
  .put("/:id/skills/:skillId", zValidator("json", trainingSkillSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    // Only the name is editable here; the skill's level (confidence) is owned solely
    // by PUT .../level so milestone history can't be bypassed.
    const [updated] = await db
      .update(trainingSkills)
      .set({ name: c.req.valid("json").name })
      .where(eq(trainingSkills.id, skill.id))
      .returning();
    if (!updated) throw new Error("failed to update skill");
    return c.json({ skill: updated });
  })
  .put("/:id/skills/:skillId/level", zValidator("json", skillLevelSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const level = c.req.valid("json").level;
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skill.id}))`);
      return setSkillLevel(skill.id, level, tx);
    });
    await recordEvent("training.level_set", {
      userId: c.get("userId"),
      props: { level },
    });
    return c.json({ skill: updated });
  })
  .delete("/:id/skills/:skillId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const [deleted] = await db
      .delete(trainingSkills)
      .where(eq(trainingSkills.id, skill.id))
      .returning({ id: trainingSkills.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
  .post(
    "/:id/skills/:skillId/sessions",
    zValidator("json", practiceSessionApiSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
      if (!skill) return c.json({ error: "not_found" } as const, 404);
      const body = c.req.valid("json");
      const occurredAt = practiceOccurredAt(body.occurredAt);
      if (occurredAt === null) return c.json({ error: "invalid_practice_session" } as const, 400);
      if (occurredAt === "future") {
        return c.json({ error: "future_practice_session" } as const, 400);
      }
      const resolvedPracticeDay = practiceDay(occurredAt, body.timezoneOffsetMinutes);
      const target = body.practicedTarget;
      const audit = target
        ? await resolvePracticeTargetAudit({
            dogId: dog.id,
            skillId: skill.id,
            suggestionId: target.suggestionId,
            createdAfter: new Date(Date.now() - PRACTICE_TARGET_MAX_AGE_MS),
          })
        : null;
      const result = await db.transaction(async (tx) => {
        if (body.safetySignal) await lockDogSafety(tx, dog.id);
        if (target) await lockSuggestionAnchor(tx, target.suggestionId);
        const [lockedSkill] = await tx
          .select()
          .from(trainingSkills)
          .where(eq(trainingSkills.id, skill.id))
          .for("update");
        if (!lockedSkill) return null;

        let anchorRejected:
          | "practice_day_required"
          | "audit_unavailable"
          | "invalid_anchor"
          | "invalid_target"
          | "target_locked"
          | null = null;
        let anchor:
          | {
              level: number;
              curriculumVersion: string;
              variant: "primary" | "fallback" | null;
              suggestionId: string | null;
            }
          | undefined;
        if (target) {
          if (!resolvedPracticeDay) {
            anchorRejected = "practice_day_required";
          } else if (audit === "unavailable") {
            anchorRejected = "audit_unavailable";
          } else if (!audit || (await isSuggestionSkipped(tx, target.suggestionId))) {
            anchorRejected = "invalid_anchor";
          } else {
            const level = target.variant === "primary" ? audit.level : audit.fallbackLevel;
            if (level == null) {
              anchorRejected = "invalid_anchor";
            } else if (level > lockedSkill.confidence) {
              anchorRejected = "invalid_target";
            } else {
              anchor = {
                level,
                curriculumVersion: audit.curriculumVersion,
                variant: target.variant,
                suggestionId: target.suggestionId,
              };
            }
          }
        } else {
          const manualAnchor = resolveConfirmedCurrentLevelAnchor(
            body.confirmCurrentLevel,
            lockedSkill,
            resolvedPracticeDay,
          );
          if (manualAnchor.kind === "rejected") {
            anchorRejected = manualAnchor.reason;
          } else if (manualAnchor.kind === "accepted") {
            anchor = {
              level: manualAnchor.level,
              curriculumVersion: manualAnchor.curriculumVersion,
              variant: null,
              suggestionId: null,
            };
          }
        }
        const [session] = await tx
          .insert(practiceSessions)
          .values({
            skillId: skill.id,
            occurredAt,
            durationMinutes: body.durationMinutes ?? null,
            notes: body.notes ?? null,
            outcome: body.outcome ?? null,
            cueSupport: body.cueSupport ?? null,
            environment: body.environment ?? null,
            distance: body.distance ?? null,
            durationBand: body.durationBand ?? null,
            distraction: body.distraction ?? null,
            curriculumLevel: anchor?.level ?? null,
            curriculumVersion: anchor?.curriculumVersion ?? null,
            practiceVariant: anchor?.variant ?? null,
            suggestionId: anchor?.suggestionId ?? null,
            practiceDay: resolvedPracticeDay,
          })
          .returning();
        if (!session) throw new Error("failed to create practice session");
        if (body.safetySignal) {
          await tx.insert(dogSafetySignals).values({
            dogId: dog.id,
            type: body.safetySignal,
            source: "practice_session",
            reportedAt: new Date(),
          });
        }
        return { session, anchorRejected };
      });
      if (!result) return c.json({ error: "not_found" } as const, 404);
      await recordEvent("training.practice_logged", {
        userId: c.get("userId"),
        props: {
          outcome: result.session.outcome ?? "unanswered",
          hasCueSupport: result.session.cueSupport !== null,
          hasEnvironment: result.session.environment !== null,
          hasDistance: result.session.distance !== null,
          hasDurationBand: result.session.durationBand !== null,
          hasDistraction: result.session.distraction !== null,
          levelAnchored: result.session.curriculumLevel !== null,
          anchorSource:
            result.session.suggestionId !== null
              ? "suggestion"
              : result.session.curriculumLevel !== null
                ? "manual_confirmation"
                : "unanchored",
        },
      });
      if (result.session.outcome) {
        await recordEvent("training.practice_outcome_recorded", {
          userId: c.get("userId"),
          props: {
            outcome: result.session.outcome,
            level: result.session.curriculumLevel ?? 0,
            variant: result.session.practiceVariant ?? "unlinked",
            curriculumVersion: result.session.curriculumVersion ?? "unlinked",
          },
        });
      }
      if (body.safetySignal) {
        await recordEvent("safety.signal_reported", {
          userId: c.get("userId"),
          props: { signal: body.safetySignal, source: "practice_session" },
        });
      }
      return c.json(result, 201);
    },
  )
  .patch(
    "/:id/skills/:skillId/sessions/:sessionId/evidence",
    zValidator("json", practiceEvidenceSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
      if (!skill) return c.json({ error: "not_found" } as const, 404);
      const body = c.req.valid("json");
      const target = body.practicedTarget;
      const audit = target
        ? await resolvePracticeTargetAudit({
            dogId: dog.id,
            skillId: skill.id,
            suggestionId: target.suggestionId,
            createdAfter: new Date(Date.now() - PRACTICE_TARGET_MAX_AGE_MS),
          })
        : null;
      const result = await db.transaction(async (tx) => {
        if (body.safetySignal) await lockDogSafety(tx, dog.id);
        if (target) await lockSuggestionAnchor(tx, target.suggestionId);
        const [lockedSkill] = await tx
          .select()
          .from(trainingSkills)
          .where(eq(trainingSkills.id, skill.id))
          .for("update");
        if (!lockedSkill) return null;
        const [existing] = await tx
          .select()
          .from(practiceSessions)
          .where(
            and(
              eq(practiceSessions.id, c.req.param("sessionId")),
              eq(practiceSessions.skillId, skill.id),
            ),
          )
          .for("update");
        if (!existing) return null;

        let anchorRejected:
          | "practice_day_required"
          | "audit_unavailable"
          | "invalid_anchor"
          | "invalid_target"
          | "target_locked"
          | null = null;
        let anchor:
          | {
              level: number;
              curriculumVersion: string;
              variant: "primary" | "fallback" | null;
              suggestionId: string | null;
            }
          | undefined;
        if (target) {
          if (!existing.practiceDay) {
            anchorRejected = "practice_day_required";
          } else if (audit === "unavailable") {
            anchorRejected = "audit_unavailable";
          } else if (!audit || (await isSuggestionSkipped(tx, target.suggestionId))) {
            anchorRejected = "invalid_anchor";
          } else {
            const level = target.variant === "primary" ? audit.level : audit.fallbackLevel;
            if (level == null) {
              anchorRejected = "invalid_anchor";
            } else if (level > lockedSkill.confidence) {
              anchorRejected = "invalid_target";
            } else if (
              existing.curriculumLevel !== null &&
              (existing.suggestionId !== target.suggestionId ||
                existing.practiceVariant !== target.variant ||
                existing.curriculumLevel !== level)
            ) {
              anchorRejected = "target_locked";
            } else if (existing.curriculumLevel === null) {
              anchor = {
                level,
                curriculumVersion: audit.curriculumVersion,
                variant: target.variant,
                suggestionId: target.suggestionId,
              };
            }
          }
        } else {
          const manualAnchor = resolveConfirmedCurrentLevelAnchor(
            body.confirmCurrentLevel,
            lockedSkill,
            existing.practiceDay,
            existing,
          );
          if (manualAnchor.kind === "rejected") {
            anchorRejected = manualAnchor.reason;
          } else if (manualAnchor.kind === "accepted") {
            anchor = {
              level: manualAnchor.level,
              curriculumVersion: manualAnchor.curriculumVersion,
              variant: null,
              suggestionId: null,
            };
          }
        }
        const changes: Partial<typeof practiceSessions.$inferInsert> = {};
        if (body.outcome !== undefined) changes.outcome = body.outcome;
        if (body.cueSupport !== undefined) changes.cueSupport = body.cueSupport;
        if (body.environment !== undefined) changes.environment = body.environment;
        if (body.distance !== undefined) changes.distance = body.distance;
        if (body.durationBand !== undefined) changes.durationBand = body.durationBand;
        if (body.distraction !== undefined) changes.distraction = body.distraction;
        if (anchor) {
          changes.curriculumLevel = anchor.level;
          changes.curriculumVersion = anchor.curriculumVersion;
          changes.practiceVariant = anchor.variant;
          changes.suggestionId = anchor.suggestionId;
        }
        const session =
          Object.keys(changes).length === 0
            ? existing
            : (
                await tx
                  .update(practiceSessions)
                  .set(changes)
                  .where(eq(practiceSessions.id, existing.id))
                  .returning()
              )[0];
        if (!session) throw new Error("failed to update practice session");
        if (body.safetySignal) {
          await tx.insert(dogSafetySignals).values({
            dogId: dog.id,
            type: body.safetySignal,
            source: "practice_session",
            reportedAt: new Date(),
          });
        }
        return { session, anchorRejected };
      });
      if (!result) return c.json({ error: "not_found" } as const, 404);
      if (result.session.outcome && body.outcome !== undefined) {
        await recordEvent("training.practice_outcome_recorded", {
          userId: c.get("userId"),
          props: {
            outcome: result.session.outcome,
            level: result.session.curriculumLevel ?? 0,
            variant: result.session.practiceVariant ?? "unlinked",
            curriculumVersion: result.session.curriculumVersion ?? "unlinked",
          },
        });
      }
      if (body.safetySignal) {
        await recordEvent("safety.signal_reported", {
          userId: c.get("userId"),
          props: { signal: body.safetySignal, source: "practice_session" },
        });
      }
      return c.json(result);
    },
  )
  .delete("/:id/skills/:skillId/sessions/:sessionId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${skill.id}))`);
      const [currentSkill] = await tx
        .select({ id: trainingSkills.id })
        .from(trainingSkills)
        .where(eq(trainingSkills.id, skill.id))
        .for("update")
        .limit(1);
      if (!currentSkill) return null;
      const [session] = await tx
        .select({ id: practiceSessions.id })
        .from(practiceSessions)
        .where(
          and(
            eq(practiceSessions.id, c.req.param("sessionId")),
            eq(practiceSessions.skillId, skill.id),
          ),
        )
        .for("update");
      if (!session) return null;
      const [row] = await tx
        .delete(practiceSessions)
        .where(eq(practiceSessions.id, session.id))
        .returning({ id: practiceSessions.id });
      await tx
        .update(advancementProposals)
        .set({ status: "withdrawn", decidedAt: new Date() })
        .where(
          and(
            eq(advancementProposals.skillId, skill.id),
            eq(advancementProposals.status, "proposed"),
          ),
        );
      return row;
    });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
  .get("/:id/focus", zValidator("query", focusWeekCompatSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const input = c.req.valid("query");
    let legacy = false;
    let week: NormalizedFocusWeek | null;
    if ("weekStart" in input) {
      legacy = true;
      week = legacyWeekInput(input);
    } else {
      week = input;
    }
    if (!week) return c.json({ error: "invalid_focus_week" } as const, 400);
    const currentWeek = isCurrentFocusWeek(week);
    if (currentWeek) {
      await claimLegacyFocus(dog.id, week.weekKey);
    }
    if (legacy && currentWeek) {
      await rememberLegacyFocusWeek(dog.id, c.get("sessionId"), week.weekKey);
      await recordEvent("focus.legacy_compat_used", {
        userId: c.get("userId"),
        sessionId: c.get("sessionId"),
        props: { operation: "read" },
      });
    }
    const data = await loadFocusWeek(
      dog.id,
      week.weekKey,
      week.timezoneOffsetMinutes,
      week.weekEndTimezoneOffsetMinutes,
    );
    return c.json(data);
  })
  .post("/:id/focus", zValidator("json", focusAddCompatSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const body = c.req.valid("json");
    const legacy = !("weekKey" in body);
    let weekKey: string | null;
    if ("weekKey" in body) {
      weekKey = body.weekKey;
    } else {
      weekKey = await legacyFocusWeekKey(dog.id, c.get("sessionId"));
    }
    if (!weekKey) return c.json({ error: "legacy_focus_context_required" } as const, 409);
    if (legacy) {
      await recordEvent("focus.legacy_compat_used", {
        userId: c.get("userId"),
        sessionId: c.get("sessionId"),
        props: { operation: "write" },
      });
    }
    const skill = await findOwnedSkill(c.get("userId"), dog.id, body.skillId);
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const result = await db.transaction((tx) => setWeeklyFocus(tx, dog.id, skill.id, weekKey));
    if (result.kind === "unchanged") return c.json({ ok: true, unchanged: true } as const);
    await recordEvent("focus.week_set", {
      userId: c.get("userId"),
      props: { replaced: result.kind === "replaced" },
    });
    return c.json({ focus: result.focus }, result.kind === "created" ? 201 : 200);
  })
  .delete("/:id/focus/:skillId", zValidator("query", focusRemoveCompatSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const input = c.req.valid("query");
    const legacy = !("weekKey" in input);
    let weekKey: string | null;
    if ("weekKey" in input) {
      weekKey = input.weekKey;
    } else {
      weekKey = await legacyFocusWeekKey(dog.id, c.get("sessionId"));
    }
    if (!weekKey) return c.json({ error: "legacy_focus_context_required" } as const, 409);
    const deleted = await withFocusWeekLock(dog.id, weekKey, async (tx) => {
      await tx.execute(sql`select set_config('app.allow_weekly_focus_delete', 'on', true)`);
      const [row] = await tx
        .delete(weeklyFocus)
        .where(
          and(
            eq(weeklyFocus.dogId, dog.id),
            eq(weeklyFocus.skillId, c.req.param("skillId")),
            eq(weeklyFocus.weekStart, weekKey),
          ),
        )
        .returning({ id: weeklyFocus.id });
      return row;
    });
    if (legacy) {
      await recordEvent("focus.legacy_compat_used", {
        userId: c.get("userId"),
        sessionId: c.get("sessionId"),
        props: { operation: "delete" },
      });
    }
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
  .get("/:id/suggestion", zValidator("query", suggestionQuerySchema), async (c) => {
    const dogId = c.req.param("id");
    if (!uuidSchema.safeParse(dogId).success) {
      return c.json({ error: "not_found" } as const, 404);
    }
    const dog = await findOwnedDog(c.get("userId"), dogId);
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weekKey, timezoneOffsetMinutes } = c.req.valid("query");
    if (weekKey !== currentWeekKey(new Date(), timezoneOffsetMinutes)) {
      return c.json({ error: "historical_suggestion_unavailable" } as const, 409);
    }
    const suggestion = await loadSuggestion({
      userId: c.get("userId"),
      dogId: dog.id,
      weekKey,
      timezoneOffsetMinutes,
    });
    return c.json({ suggestion });
  })
  .post(
    "/:id/suggestions/:suggestionId/actions",
    zValidator("json", suggestionActionSchema),
    async (c) => {
      const dogId = c.req.param("id");
      if (!uuidSchema.safeParse(dogId).success) {
        return c.json({ error: "not_found" } as const, 404);
      }
      const dog = await findOwnedDog(c.get("userId"), dogId);
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const suggestionId = c.req.param("suggestionId");
      if (!uuidSchema.safeParse(suggestionId).success) {
        return c.json({ error: "not_found" } as const, 404);
      }
      const result = await recordSuggestionAction({
        userId: c.get("userId"),
        dogId: dog.id,
        suggestionId,
        action: c.req.valid("json").action,
      });
      if (result === "not_found") return c.json({ error: "not_found" } as const, 404);
      if (result === "dismissed") {
        return c.json({ error: "suggestion_dismissed" } as const, 409);
      }
      return c.json({ ok: true } as const, 201);
    },
  )
  .post(
    "/:id/advancement-proposals/:proposalId/decision",
    zValidator("json", advancementDecisionSchema),
    async (c) => {
      const dogId = c.req.param("id");
      if (!uuidSchema.safeParse(dogId).success) {
        return c.json({ error: "not_found" } as const, 404);
      }
      const dog = await findOwnedDog(c.get("userId"), dogId);
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const proposalId = c.req.param("proposalId");
      if (!uuidSchema.safeParse(proposalId).success) {
        return c.json({ error: "not_found" } as const, 404);
      }
      const [owned] = await db
        .select({ id: advancementProposals.id, skillId: advancementProposals.skillId })
        .from(advancementProposals)
        .innerJoin(trainingSkills, eq(advancementProposals.skillId, trainingSkills.id))
        .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
        .where(and(eq(advancementProposals.id, proposalId), eq(trainingGoals.dogId, dog.id)))
        .limit(1);
      if (!owned) return c.json({ error: "not_found" } as const, 404);

      const { decision } = c.req.valid("json");
      const result = await decideAdvancementProposal(dog.id, owned.id, owned.skillId, decision);
      if (result.status === "not_found") return c.json({ error: "not_found" } as const, 404);
      if (result.status === "stale") {
        return c.json({ error: "stale_proposal" } as const, 409);
      }
      if (result.status === "safety_suppressed") {
        return c.json({ error: "safety_suppressed" } as const, 409);
      }
      const { proposal } = result;
      await recordEvent("training.advancement_decided", {
        userId: c.get("userId"),
        props: {
          decision,
          fromLevel: proposal.fromLevel,
          toLevel: proposal.toLevel,
        },
      });
      return c.json({ proposal });
    },
  )
  .get("/:id/journal", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.dogId, dog.id))
      .orderBy(desc(journalEntries.occurredAt));
    return c.json({ entries });
  })
  .post("/:id/journal", zValidator("json", journalEntryCreateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    let entry: typeof journalEntries.$inferSelect;
    try {
      entry = await db.transaction((tx) => createJournalEntry(tx, dog.id, b));
    } catch (error) {
      if (error instanceof InvalidJournalOccurredAtError) {
        return c.json(invalidJournalField("occurredAt", "Invalid date"), 400);
      }
      throw error;
    }
    await recordEvent("journal.entry_created", {
      userId: c.get("userId"),
      props: { kind: b.kind },
    });
    return c.json({ entry }, 201);
  })
  .put("/:id/journal/:entryId", zValidator("json", journalEntryUpdateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const entryId = c.req.param("entryId");

    const result = await withDogSafetyLock(dog.id, async (tx) => {
      const [existing] = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, entryId), eq(journalEntries.dogId, dog.id)))
        .limit(1)
        .for("update");
      if (!existing) return { kind: "not_found" } as const;

      const changes: Partial<typeof journalEntries.$inferInsert> = {};
      const nextKind = b.kind ?? existing.kind;
      if (b.kind !== undefined) changes.kind = b.kind;
      if (b.occurredAt !== undefined) {
        const occurredAt = new Date(b.occurredAt);
        if (Number.isNaN(occurredAt.getTime())) {
          return { kind: "invalid_occurred_at" } as const;
        }
        changes.occurredAt = occurredAt;
      }
      if (b.note !== undefined) changes.note = b.note;

      if (nextKind === "daily_checkin") {
        const nextTrend = b.trend === undefined ? existing.trend : b.trend;
        if (!nextTrend) return { kind: "missing_trend" } as const;
        changes.trend = nextTrend;
        changes.antecedent = null;
        changes.behavior = null;
        changes.consequence = null;
        changes.intensity = null;
        changes.location = null;
        changes.notes = null;
        changes.durationSeconds = null;
        changes.recoverySeconds = null;
        changes.peoplePresent = null;
        changes.ownerResponse = null;
      } else {
        changes.trend = null;
        if (b.antecedent !== undefined) changes.antecedent = b.antecedent ?? null;
        if (b.behavior !== undefined) changes.behavior = b.behavior ?? null;
        if (b.consequence !== undefined) changes.consequence = b.consequence ?? null;
        if (b.intensity !== undefined) changes.intensity = b.intensity ?? null;
        if (b.location !== undefined) changes.location = b.location ?? null;
        if (b.notes !== undefined) changes.notes = b.notes ?? null;
        if (b.durationSeconds !== undefined) changes.durationSeconds = b.durationSeconds ?? null;
        if (b.recoverySeconds !== undefined) changes.recoverySeconds = b.recoverySeconds ?? null;
        if (b.peoplePresent !== undefined) changes.peoplePresent = b.peoplePresent ?? null;
        if (b.ownerResponse !== undefined) changes.ownerResponse = b.ownerResponse ?? null;
      }

      const [updated] = await tx
        .update(journalEntries)
        .set(changes)
        .where(and(eq(journalEntries.id, entryId), eq(journalEntries.dogId, dog.id)))
        .returning();
      if (!updated) return { kind: "not_found" } as const;
      return { kind: "updated", entry: updated } as const;
    });

    if (result.kind === "invalid_occurred_at") {
      return c.json(invalidJournalField("occurredAt", "Invalid date"), 400);
    }
    if (result.kind === "missing_trend") {
      return c.json(invalidJournalField("trend", "Trend is required for daily check-ins"), 400);
    }
    if (result.kind === "not_found") return c.json({ error: "not_found" } as const, 404);
    return c.json({ entry: result.entry });
  })
  .delete("/:id/journal/:entryId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const entryId = c.req.param("entryId");
    await withDogSafetyLock(dog.id, (tx) =>
      tx
        .delete(journalEntries)
        .where(and(eq(journalEntries.id, entryId), eq(journalEntries.dogId, dog.id))),
    );
    return c.json({ ok: true } as const);
  })
  .get("/:id/brief", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    return c.json({ brief: brief ?? null });
  })
  .post("/:id/brief/share", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "no_brief" } as const, 404);
    let token = brief.shareToken;
    if (!token) {
      token = randomBytes(18).toString("base64url");
      await db.update(briefs).set({ shareToken: token }).where(eq(briefs.id, brief.id));
    }
    await recordEvent("brief.shared", { userId: c.get("userId") });
    return c.json({ token, url: `${env.FRONTEND_URL}/b/${token}` });
  })
  .delete("/:id/brief/share", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "not_found" } as const, 404);
    await db.update(briefs).set({ shareToken: null }).where(eq(briefs.id, brief.id));
    return c.json({ ok: true } as const);
  })
  .post("/:id/brief", zValidator("query", briefGenerateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { window } = c.req.valid("query");
    const windowDays = window === "all" ? null : Number(window.replace("d", ""));
    const cutoff = windowDays === null ? null : new Date(Date.now() - windowDays * 86_400_000);
    const journalWhere = cutoff
      ? and(eq(journalEntries.dogId, dog.id), gte(journalEntries.occurredAt, cutoff))
      : eq(journalEntries.dogId, dog.id);
    const [concerns, goals, entries, progress, [last]] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
      db.select().from(journalEntries).where(journalWhere),
      loadProgress(dog.id),
      db
        .select()
        .from(briefs)
        .where(eq(briefs.dogId, dog.id))
        .orderBy(desc(briefs.version))
        .limit(1),
    ]);
    const summary = composeBrief({
      dog: { name: dog.name, breed: dog.breed, size: dog.size, sex: dog.sex },
      concerns: concerns.map((x) => ({ concern: x.concern, severity: x.severity })),
      goals: goals.map((x) => ({ goal: x.goal })),
      entries: entries.map((e) => ({
        note: e.note,
        kind: e.kind,
        trend: e.trend,
        behavior: e.behavior,
        antecedent: e.antecedent,
        consequence: e.consequence,
        intensity: e.intensity,
        occurredAt: e.occurredAt.toISOString(),
      })),
      windowDays,
      progress: progress.goals,
    });
    const [brief] = await db
      .insert(briefs)
      .values({ dogId: dog.id, summary, version: (last?.version ?? 0) + 1, status: "draft" })
      .returning();
    await recordEvent("brief.generated", { userId: c.get("userId"), props: { window } });
    return c.json({ brief }, 201);
  })
  .put("/:id/brief", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [latest] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!latest) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .update(briefs)
      .set({ status: "finalized" })
      .where(eq(briefs.id, latest.id))
      .returning();
    await recordEvent("brief.finalized", { userId: c.get("userId") });
    return c.json({ brief });
  })
  .post("/:id/brief/send", zValidator("json", briefSendSchema), async (c) => {
    const userId = c.get("userId");
    const dog = await findOwnedDog(userId, c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);

    // Per-user send-rate guard: max 10 brief emails per 24 hours to limit
    // abuse of the app's verified sender domain.
    const windowStart = new Date(Date.now() - 86_400_000);
    const [sendCount] = await db
      .select({ value: count() })
      .from(briefSends)
      .where(and(eq(briefSends.sentByUserId, userId), gte(briefSends.sentAt, windowStart)));
    if ((sendCount?.value ?? 0) >= 10) {
      return c.json({ error: "send_rate_limited" } as const, 429);
    }

    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "not_found" } as const, 404);
    if (brief.status !== "finalized") {
      return c.json({ error: "not_finalized" } as const, 409);
    }

    const [owner] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!owner) return c.json({ error: "not_found" } as const, 404);

    const body = c.req.valid("json");
    const email = renderBriefEmail({
      dogName: dog.name,
      ownerName: owner.name ?? owner.email,
      message: body.message ?? null,
      summary: brief.summary,
    });

    try {
      await sendEmail({
        to: body.recipient,
        replyTo: owner.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      throw sendFailedException(c, err);
    }

    const [send] = await db
      .insert(briefSends)
      .values({
        briefId: brief.id,
        recipient: body.recipient,
        message: body.message ?? null,
        sentByUserId: userId,
      })
      .returning();

    await recordEvent("brief.emailed", { userId });
    return c.json({ send }, 201);
  })
  .get("/:id/brief/sends", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);

    const sends = await db
      .select({
        id: briefSends.id,
        briefId: briefSends.briefId,
        recipient: briefSends.recipient,
        message: briefSends.message,
        sentAt: briefSends.sentAt,
      })
      .from(briefSends)
      .innerJoin(briefs, eq(briefSends.briefId, briefs.id))
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefSends.sentAt));

    return c.json({ sends });
  });
