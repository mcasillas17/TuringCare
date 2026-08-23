import { randomBytes } from "node:crypto";
import type { Locale } from "@turingcare/i18n";
import {
  VALIDATION_MESSAGE_CODES,
  behaviorConcernSchema,
  briefGenerateSchema,
  briefSendSchema,
  dogProfileSchema,
  focusAddSchema,
  focusWeekQuerySchema,
  goalFromTemplateSchema,
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  practiceSessionSchema,
  skillLevelSchema,
  trainingGoalSchema,
  trainingSkillSchema,
} from "@turingcare/shared";
import { and, count, desc, eq, gte, lt, max } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getTrainingCatalog } from "../data/training-catalog";
import { db } from "../db";
import { findOwnedDog } from "../db/owned-dog";
import { findOwnedSkill } from "../db/owned-skill";
import {
  behaviorConcerns,
  briefSends,
  briefs,
  dogs,
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
import { composeBrief } from "../lib/brief";
import { loadDogsOverview } from "../lib/dogs-overview";
import { loadFocusWeek } from "../lib/focus";
import { loadProgress } from "../lib/progress";
import { setSkillLevel } from "../lib/skill-level";
import { type Vars, requireUser } from "../middleware/require-user";
import { stableZValidator } from "../middleware/validation";
import { recordEvent } from "../telemetry/record-event";

const invalidJournalField = (path: "occurredAt" | "trend", message: string) =>
  ({
    success: false,
    error: {
      issues: [{ code: "custom", path: [path], message }],
    },
  }) as const;

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

export const dogsApp = new Hono<{ Variables: Vars & { locale: Locale } }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(dogs)
      .where(eq(dogs.ownerId, c.get("userId")))
      .orderBy(desc(dogs.createdAt));
    return c.json({ dogs: rows });
  })
  .post("/", stableZValidator("json", dogProfileSchema), async (c) => {
    const { weightLbs, ...body } = c.req.valid("json");
    const [dog] = await db
      .insert(dogs)
      .values({
        ...body,
        ownerId: c.get("userId"),
        weightLbs: weightLbs == null ? weightLbs : String(weightLbs),
      })
      .returning();
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
  .put("/:id", stableZValidator("json", dogProfileSchema), async (c) => {
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
    await db.delete(dogs).where(eq(dogs.id, dog.id));
    return c.json({ ok: true } as const);
  })
  .post("/:id/concerns", stableZValidator("json", behaviorConcernSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [concern] = await db
      .insert(behaviorConcerns)
      .values({ ...c.req.valid("json"), dogId: dog.id })
      .returning();
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
  .post("/:id/goals", stableZValidator("json", trainingGoalSchema), async (c) => {
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
  .post("/:id/goals/from-template", stableZValidator("json", goalFromTemplateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { templateKey } = c.req.valid("json");
    const template = getTrainingCatalog(c.get("locale")).find((t) => t.key === templateKey);
    if (!template) return c.json({ error: "invalid_template" } as const, 400);

    const { goal, skills } = await db.transaction(async (tx) => {
      const [createdGoal] = await tx
        .insert(trainingGoals)
        .values({ dogId: dog.id, goal: template.name, catalogGoalKey: template.key })
        .returning();
      if (!createdGoal) throw new Error("failed to create template goal");
      const createdSkills = await tx
        .insert(trainingSkills)
        .values(
          template.skills.map((skill, index) => ({
            goalId: createdGoal.id,
            name: skill.name,
            confidence: 1,
            position: index,
            catalogSkillKey: skill.key,
          })),
        )
        .returning();
      return { goal: createdGoal, skills: createdSkills };
    });

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
  .post("/:id/goals/:goalId/skills", stableZValidator("json", trainingSkillSchema), async (c) => {
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
  .put("/:id/skills/:skillId", stableZValidator("json", trainingSkillSchema), async (c) => {
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
  .put("/:id/skills/:skillId/level", stableZValidator("json", skillLevelSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const updated = await setSkillLevel(skill.id, c.req.valid("json").level);
    await recordEvent("training.level_set", {
      userId: c.get("userId"),
      props: { level: c.req.valid("json").level },
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
    stableZValidator("json", practiceSessionSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
      if (!skill) return c.json({ error: "not_found" } as const, 404);
      const body = c.req.valid("json");
      const [session] = await db
        .insert(practiceSessions)
        .values({
          skillId: skill.id,
          occurredAt: new Date(body.occurredAt),
          durationMinutes: body.durationMinutes ?? null,
          notes: body.notes ?? null,
        })
        .returning();
      if (!session) throw new Error("failed to create practice session");
      await recordEvent("training.practice_logged", { userId: c.get("userId") });
      return c.json({ session }, 201);
    },
  )
  .delete("/:id/skills/:skillId/sessions/:sessionId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const [deleted] = await db
      .delete(practiceSessions)
      .where(
        and(
          eq(practiceSessions.id, c.req.param("sessionId")),
          eq(practiceSessions.skillId, skill.id),
        ),
      )
      .returning({ id: practiceSessions.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
  .get("/:id/focus", stableZValidator("query", focusWeekQuerySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weekStart, weekEnd } = c.req.valid("query");
    const data = await loadFocusWeek(dog.id, weekStart, weekEnd);
    return c.json(data);
  })
  .post("/:id/focus", stableZValidator("json", focusAddSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { skillId } = c.req.valid("json");
    const skill = await findOwnedSkill(c.get("userId"), dog.id, skillId);
    if (!skill) return c.json({ error: "not_found" } as const, 404);
    const existing = await db
      .select({ id: weeklyFocus.id })
      .from(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, skillId)))
      .limit(1);
    if (existing[0]) return c.json({ error: "already_focused" } as const, 409);
    const [{ value: maxPos } = { value: null }] = await db
      .select({ value: max(weeklyFocus.position) })
      .from(weeklyFocus)
      .where(eq(weeklyFocus.dogId, dog.id));
    const [row] = await db
      .insert(weeklyFocus)
      .values({ dogId: dog.id, skillId, position: (maxPos ?? -1) + 1 })
      .returning();
    if (!row) throw new Error("failed to add focus skill");
    await recordEvent("focus.week_set", { userId: c.get("userId") });
    return c.json({ focus: row }, 201);
  })
  .delete("/:id/focus/:skillId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [deleted] = await db
      .delete(weeklyFocus)
      .where(and(eq(weeklyFocus.dogId, dog.id), eq(weeklyFocus.skillId, c.req.param("skillId"))))
      .returning({ id: weeklyFocus.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
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
  .post("/:id/journal", stableZValidator("json", journalEntryCreateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const occurredAt = b.occurredAt ? new Date(b.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return c.json(invalidJournalField("occurredAt", VALIDATION_MESSAGE_CODES.dateInvalid), 400);
    }
    const [entry] = await db
      .insert(journalEntries)
      .values({
        dogId: dog.id,
        kind: b.kind,
        occurredAt,
        note: b.note,
        trend: b.kind === "daily_checkin" ? b.trend : null,
        antecedent: b.kind === "moment" ? (b.antecedent ?? null) : null,
        behavior: b.kind === "moment" ? (b.behavior ?? null) : null,
        consequence: b.kind === "moment" ? (b.consequence ?? null) : null,
        intensity: b.kind === "moment" ? (b.intensity ?? null) : null,
        location: b.kind === "moment" ? (b.location ?? null) : null,
        notes: b.kind === "moment" ? (b.notes ?? null) : null,
        durationSeconds: b.kind === "moment" ? (b.durationSeconds ?? null) : null,
        recoverySeconds: b.kind === "moment" ? (b.recoverySeconds ?? null) : null,
        peoplePresent: b.kind === "moment" ? (b.peoplePresent ?? null) : null,
        ownerResponse: b.kind === "moment" ? (b.ownerResponse ?? null) : null,
      })
      .returning();
    await recordEvent("journal.entry_created", {
      userId: c.get("userId"),
      props: { kind: b.kind },
    });
    return c.json({ entry }, 201);
  })
  .put("/:id/journal/:entryId", stableZValidator("json", journalEntryUpdateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const [existing] = await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, c.req.param("entryId")), eq(journalEntries.dogId, dog.id)))
      .limit(1);
    if (!existing) return c.json({ error: "not_found" } as const, 404);

    const changes: Partial<typeof journalEntries.$inferInsert> = {};
    const nextKind = b.kind ?? existing.kind;
    if (b.kind !== undefined) changes.kind = b.kind;
    if (b.occurredAt !== undefined) {
      const occurredAt = new Date(b.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        return c.json(invalidJournalField("occurredAt", VALIDATION_MESSAGE_CODES.dateInvalid), 400);
      }
      changes.occurredAt = occurredAt;
    }
    if (b.note !== undefined) changes.note = b.note;

    if (nextKind === "daily_checkin") {
      const nextTrend = b.trend === undefined ? existing.trend : b.trend;
      if (!nextTrend) {
        return c.json(
          invalidJournalField("trend", VALIDATION_MESSAGE_CODES.dailyCheckInTrendRequired),
          400,
        );
      }
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

    const [entry] = await db
      .update(journalEntries)
      .set(changes)
      .where(and(eq(journalEntries.id, c.req.param("entryId")), eq(journalEntries.dogId, dog.id)))
      .returning();
    if (!entry) return c.json({ error: "not_found" } as const, 404);
    return c.json({ entry });
  })
  .delete("/:id/journal/:entryId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, c.req.param("entryId")), eq(journalEntries.dogId, dog.id)));
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
    const result = await db.transaction(async (tx) => {
      const [lockedDog] = await tx
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.id, dog.id), eq(dogs.ownerId, c.get("userId"))))
        .for("update");
      if (!lockedDog) return { kind: "not_found" } as const;

      const [brief] = await tx
        .select()
        .from(briefs)
        .where(eq(briefs.dogId, lockedDog.id))
        .orderBy(desc(briefs.version))
        .limit(1)
        .for("update");
      if (!brief) return { kind: "no_brief" } as const;
      if (brief.shareToken) return { kind: "shared", token: brief.shareToken } as const;

      const token = randomBytes(18).toString("base64url");
      const [updated] = await tx
        .update(briefs)
        .set({ shareToken: token })
        .where(eq(briefs.id, brief.id))
        .returning({ shareToken: briefs.shareToken });
      if (updated?.shareToken !== token) throw new Error("failed to mint brief share token");
      return { kind: "shared", token } as const;
    });
    if (result.kind === "not_found") return c.json({ error: "not_found" } as const, 404);
    if (result.kind === "no_brief") return c.json({ error: "no_brief" } as const, 404);
    await recordEvent("brief.shared", { userId: c.get("userId") });
    return c.json({ token: result.token, url: `${env.FRONTEND_URL}/b/${result.token}` });
  })
  .delete("/:id/brief/share", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const revoked = await db.transaction(async (tx) => {
      const [lockedDog] = await tx
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.id, dog.id), eq(dogs.ownerId, c.get("userId"))))
        .for("update");
      if (!lockedDog) return false;

      const [brief] = await tx
        .select({ id: briefs.id })
        .from(briefs)
        .where(eq(briefs.dogId, lockedDog.id))
        .orderBy(desc(briefs.version))
        .limit(1)
        .for("update");
      if (!brief) return false;

      const [updated] = await tx
        .update(briefs)
        .set({ shareToken: null })
        .where(eq(briefs.id, brief.id))
        .returning({ id: briefs.id });
      if (!updated) throw new Error("failed to revoke brief share token");
      return true;
    });
    if (!revoked) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  })
  .post("/:id/brief", stableZValidator("query", briefGenerateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { window } = c.req.valid("query");
    const windowDays = window === "all" ? null : Number(window.replace("d", ""));
    const cutoff = windowDays === null ? null : new Date(Date.now() - windowDays * 86_400_000);
    const journalWhere = cutoff
      ? and(eq(journalEntries.dogId, dog.id), gte(journalEntries.occurredAt, cutoff))
      : eq(journalEntries.dogId, dog.id);
    const [concerns, goals, entries, progress] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
      db.select().from(journalEntries).where(journalWhere),
      loadProgress(dog.id),
    ]);
    const locale = c.get("locale");
    const summary = composeBrief(
      {
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
      },
      locale,
    );
    const brief = await db.transaction(async (tx) => {
      // The parent dog row is the database-backed, per-dog serialization point.
      // PostgreSQL holds this row lock until commit, so a concurrent generator
      // cannot read the previous version until the earlier insert is visible.
      const [lockedDog] = await tx
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.id, dog.id), eq(dogs.ownerId, c.get("userId"))))
        .for("update");
      if (!lockedDog) return null;
      const [last] = await tx
        .select({ version: briefs.version })
        .from(briefs)
        .where(eq(briefs.dogId, lockedDog.id))
        .orderBy(desc(briefs.version))
        .limit(1);
      const [created] = await tx
        .insert(briefs)
        .values({
          dogId: lockedDog.id,
          locale,
          summary,
          version: (last?.version ?? 0) + 1,
          status: "draft",
        })
        .returning();
      if (!created) throw new Error("failed to create brief");
      return created;
    });
    if (!brief) return c.json({ error: "not_found" } as const, 404);
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
  .post("/:id/brief/send", stableZValidator("json", briefSendSchema), async (c) => {
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
    const email = renderBriefEmail(
      {
        dogName: dog.name,
        ownerName: owner.name ?? owner.email,
        message: body.message ?? null,
        summary: brief.summary,
      },
      brief.locale,
    );

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
