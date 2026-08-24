import { trainerInputSchema } from "@turingcare/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { trainers } from "../db/schema";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";
import { stableZValidator } from "../middleware/validation";

export const adminTrainersApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .post("/", stableZValidator("json", trainerInputSchema), async (c) => {
    const [trainer] = await db.insert(trainers).values(c.req.valid("json")).returning();
    return c.json({ trainer }, 201);
  })
  .put("/:id", stableZValidator("json", trainerInputSchema), async (c) => {
    const [trainer] = await db
      .update(trainers)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(trainers.id, c.req.param("id")))
      .returning();
    if (!trainer) return c.json({ error: "not_found" } as const, 404);
    return c.json({ trainer });
  })
  .delete("/:id", async (c) => {
    const [deleted] = await db
      .delete(trainers)
      .where(eq(trainers.id, c.req.param("id")))
      .returning({ id: trainers.id });
    if (!deleted) return c.json({ error: "not_found" } as const, 404);
    return c.json({ ok: true } as const);
  });
