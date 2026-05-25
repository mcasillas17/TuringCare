import { zValidator } from "@hono/zod-validator";
import { courseInputSchema } from "@turingcare/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { courses } from "../db/schema";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";

export const adminCoursesApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .post("/", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db.insert(courses).values(c.req.valid("json")).returning();
    return c.json({ course }, 201);
  })
  .put("/:id", zValidator("json", courseInputSchema), async (c) => {
    const [course] = await db
      .update(courses)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(courses.id, c.req.param("id")))
      .returning();
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await db
      .delete(courses)
      .where(eq(courses.id, c.req.param("id")))
      .returning({ id: courses.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  });
