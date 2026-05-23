import { randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
  behaviorConcernSchema,
  briefSendSchema,
  dogProfileSchema,
  journalEntrySchema,
  practiceSessionSchema,
  skillConfidenceSchema,
  trainingGoalSchema,
  trainingSkillSchema,
} from "@turingcare/shared";
import { and, desc, eq, max } from "drizzle-orm";
import { Hono } from "hono";
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
} from "../db/schema";
import { renderBriefEmail } from "../email/brief-email";
import { sendEmail } from "../email/send-email";
import { env } from "../env";
import { composeBrief } from "../lib/brief";
import { loadProgress } from "../lib/progress";
import { LLMError } from "../llm/anthropic";
import { polishBrief } from "../llm/polish-brief";
import { type Vars, requireUser } from "../middleware/require-user";

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
  .patch(
    "/:id/skills/:skillId/confidence",
    zValidator("json", skillConfidenceSchema),
    async (c) => {
      const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
      if (!dog) return c.json({ error: "not_found" } as const, 404);
      const skill = await findOwnedSkill(c.get("userId"), dog.id, c.req.param("skillId"));
      if (!skill) return c.json({ error: "not_found" } as const, 404);
      const [updated] = await db
        .update(trainingSkills)
        .set(c.req.valid("json"))
        .where(eq(trainingSkills.id, skill.id))
        .returning();
      if (!updated) throw new Error("failed to update skill confidence");
      return c.json({ skill: updated });
    },
  )
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
  .post("/:id/journal", zValidator("json", journalEntrySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const [entry] = await db
      .insert(journalEntries)
      .values({
        dogId: dog.id,
        occurredAt: new Date(b.occurredAt),
        antecedent: b.antecedent,
        behavior: b.behavior,
        consequence: b.consequence,
        intensity: b.intensity,
        location: b.location ?? null,
        notes: b.notes ?? null,
        durationSeconds: b.durationSeconds ?? null,
        recoverySeconds: b.recoverySeconds ?? null,
        peoplePresent: b.peoplePresent ?? null,
        ownerResponse: b.ownerResponse ?? null,
      })
      .returning();
    return c.json({ entry }, 201);
  })
  .put("/:id/journal/:entryId", zValidator("json", journalEntrySchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const b = c.req.valid("json");
    const [entry] = await db
      .update(journalEntries)
      .set({
        occurredAt: new Date(b.occurredAt),
        antecedent: b.antecedent,
        behavior: b.behavior,
        consequence: b.consequence,
        intensity: b.intensity,
        location: b.location ?? null,
        notes: b.notes ?? null,
        durationSeconds: b.durationSeconds ?? null,
        recoverySeconds: b.recoverySeconds ?? null,
        peoplePresent: b.peoplePresent ?? null,
        ownerResponse: b.ownerResponse ?? null,
      })
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
  .post("/:id/brief/narrative", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [brief] = await db
      .select()
      .from(briefs)
      .where(eq(briefs.dogId, dog.id))
      .orderBy(desc(briefs.version))
      .limit(1);
    if (!brief) return c.json({ error: "no_brief" } as const, 404);
    let narrative: string;
    try {
      narrative = await polishBrief(brief.summary);
    } catch (err) {
      if (err instanceof LLMError && err.code === "not_configured") {
        return c.json({ error: "llm_not_configured" } as const, 503);
      }
      console.error("brief narrative failed", err);
      return c.json({ error: "llm_failed" } as const, 502);
    }
    // narrativeModel records the model polishBrief used (its default, since this
    // call passes no model override).
    const [updated] = await db
      .update(briefs)
      .set({ narrative, narrativeModel: env.BRIEF_LLM_MODEL, narrativeGeneratedAt: new Date() })
      .where(eq(briefs.id, brief.id))
      .returning();
    if (!updated) return c.json({ error: "not_found" } as const, 404);
    return c.json({ brief: updated });
  })
  .post("/:id/brief", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [concerns, goals, entries, progress, [last]] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
      db.select().from(journalEntries).where(eq(journalEntries.dogId, dog.id)),
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
        behavior: e.behavior,
        intensity: e.intensity,
        occurredAt: e.occurredAt.toISOString(),
      })),
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
