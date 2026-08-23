import { zValidator } from "@hono/zod-validator";
import { profileLocaleUpdateSchema, profileUpdateSchema } from "@turingcare/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { user } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const profileApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email, locale: user.locale })
      .from(user)
      .where(eq(user.id, c.get("userId")));
    if (!u) return c.json({ error: "not_found" } as const, 404);
    return c.json({ user: u });
  })
  .put("/", zValidator("json", profileUpdateSchema), async (c) => {
    const [u] = await db
      .update(user)
      .set({ name: c.req.valid("json").name, updatedAt: new Date() })
      .where(eq(user.id, c.get("userId")))
      .returning({ id: user.id, name: user.name, email: user.email, locale: user.locale });
    return c.json({ user: u });
  })
  .patch("/locale", zValidator("json", profileLocaleUpdateSchema), async (c) => {
    const [u] = await db
      .update(user)
      .set({ locale: c.req.valid("json").locale, updatedAt: new Date() })
      .where(eq(user.id, c.get("userId")))
      .returning({ locale: user.locale });
    return c.json({ user: u });
  });
