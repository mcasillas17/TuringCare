import { zValidator } from "@hono/zod-validator";
import { dogProfileSchema } from "@turingcare/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db } from "../db";
import { dogs } from "../db/schema";

type Vars = { userId: string };

const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  c.set("userId", session.user.id);
  await next();
});

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
  });
