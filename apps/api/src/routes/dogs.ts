import { zValidator } from "@hono/zod-validator";
import { behaviorConcernSchema, dogProfileSchema, trainingGoalSchema } from "@turingcare/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db } from "../db";
import { behaviorConcerns, dogs, trainingGoals } from "../db/schema";

type Vars = { userId: string };

const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  c.set("userId", session.user.id);
  await next();
});

async function findOwnedDog(userId: string, dogId: string) {
  const [dog] = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, userId)));
  return dog ?? null;
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
    const [goal] = await db
      .insert(trainingGoals)
      .values({ ...c.req.valid("json"), dogId: dog.id })
      .returning();
    return c.json({ goal }, 201);
  })
  .delete("/:id/goals/:goalId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(trainingGoals)
      .where(and(eq(trainingGoals.id, c.req.param("goalId")), eq(trainingGoals.dogId, dog.id)));
    return c.json({ ok: true } as const);
  });
