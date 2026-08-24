import { profileLocaleUpdateSchema, profileUpdateSchema } from "@turingcare/shared";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefSends, briefs, dogs, user } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";
import { stableZValidator } from "../middleware/validation";

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
  .get("/deletion-readiness", async (c) => {
    const claims = await db
      .select({
        dogId: dogs.id,
        recoveryRequired: sql<boolean>`${briefSends.deliveryClaimedAt} IS NULL OR ${briefSends.deliveryClaimedAt} < clock_timestamp() - interval '30 seconds'`,
      })
      .from(briefSends)
      .innerJoin(briefs, eq(briefSends.briefId, briefs.id))
      .innerJoin(dogs, eq(briefs.dogId, dogs.id))
      .where(and(eq(dogs.ownerId, c.get("userId")), isNotNull(briefSends.deliveryClaimId)));
    const active = claims.find(({ recoveryRequired }) => !recoveryRequired);
    if (active) {
      return c.json({ status: "brief_delivery_in_progress" as const, dogId: active.dogId });
    }
    const stale = claims[0];
    if (stale) {
      return c.json({ status: "brief_delivery_recovery_required" as const, dogId: stale.dogId });
    }
    return c.json({ status: "ready" as const });
  })
  .put("/", stableZValidator("json", profileUpdateSchema), async (c) => {
    const [u] = await db
      .update(user)
      .set({ name: c.req.valid("json").name, updatedAt: new Date() })
      .where(eq(user.id, c.get("userId")))
      .returning({ id: user.id, name: user.name, email: user.email, locale: user.locale });
    if (!u) return c.json({ error: "not_found" } as const, 404);
    return c.json({ user: u });
  })
  .patch("/locale", stableZValidator("json", profileLocaleUpdateSchema), async (c) => {
    const [u] = await db
      .update(user)
      .set({ locale: c.req.valid("json").locale, updatedAt: new Date() })
      .where(eq(user.id, c.get("userId")))
      .returning({ locale: user.locale });
    if (!u) return c.json({ error: "not_found" } as const, 404);
    return c.json({ user: u });
  });
