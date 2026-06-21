import { randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
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
import { trainingCatalog } from "../data/training-catalog";
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
import { loadFocusWeek } from "../lib/focus";
import { loadProgress } from "../lib/progress";
import { setSkillLevel } from "../lib/skill-level";
import { type Vars, requireUser } from "../middleware/require-user";

const invalidJournalField = (path: "occurredAt" | "trend", message: string) =>
  ({
    success: false,
    error: {
      issues: [{ code: "custom", path: [path], message }],
    },
  }) as const;

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
    const { weightLbs, ...body } = c.req.valid("json");
    const [dog] = await db
      .insert(dogs)
      .values({
        ...body,
        ownerId: c.get("userId"),
        weightLbs: weightLbs == null ? weightLbs : String(weightLbs),
      })
      .returning();
    return c.json({ dog }, 201);
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
    await db.delete(dogs).where(eq(dogs.id, dog.id));
    return c.json({ ok: true } as const);
  })
  .post("/:id/concerns", zValidator("json", behaviorConcernSchema), async (c) => {
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
  .post("/:id/goals", zValidator("json", trainingGoalSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const body = c.req.valid("json");
    const [goal] = await db
      .insert(trainingGoals)
      .values({ ...body, dogId: dog.id })
      .returning();
    if (!goal) throw new Error("failed to create training goal");
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId: goal.id, name: body.goal, confidence: 1, position: 0 })
      .returning();
    if (!skill) throw new Error("failed to create default skill");
    return c.json({ goal, skill }, 201);
  })
  .post("/:id/goals/from-template", zValidator("json", goalFromTemplateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { templateKey } = c.req.valid("json");
    const template = trainingCatalog.find((t) => t.key === templateKey);
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
    const [updated] = await db
      .update(trainingSkills)
      .set(c.req.valid("json"))
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
    const updated = await setSkillLevel(skill.id, c.req.valid("json").level);
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
  .post("/:id/skills/:skillId/sessions", zValidator("json", practiceSessionSchema), async (c) => {
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
    return c.json({ session }, 201);
  })
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
  .get("/:id/focus", zValidator("query", focusWeekQuerySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const { weekStart, weekEnd } = c.req.valid("query");
    const data = await loadFocusWeek(dog.id, weekStart, weekEnd);
    return c.json(data);
  })
  .post("/:id/focus", zValidator("json", focusAddSchema), async (c) => {
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
  .post("/:id/journal", zValidator("json", journalEntryCreateSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const occurredAt = b.occurredAt ? new Date(b.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return c.json(invalidJournalField("occurredAt", "Invalid date"), 400);
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
    return c.json({ entry }, 201);
  })
  .put("/:id/journal/:entryId", zValidator("json", journalEntryUpdateSchema), async (c) => {
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
        return c.json(invalidJournalField("occurredAt", "Invalid date"), 400);
      }
      changes.occurredAt = occurredAt;
    }
    if (b.note !== undefined) changes.note = b.note;

    if (nextKind === "daily_checkin") {
      const nextTrend = b.trend === undefined ? existing.trend : b.trend;
      if (!nextTrend) {
        return c.json(invalidJournalField("trend", "Trend is required for daily check-ins"), 400);
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
      console.error("brief send failed", err);
      return c.json({ error: "send_failed" } as const, 502);
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
