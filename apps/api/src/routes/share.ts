import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefs, dogs } from "../db/schema";
import { recordEvent } from "../telemetry/record-event";

/** Public, unauthenticated read of a shared brief by token. Returns a strict
 * whitelist (no userId / dog id / token). Revoked + unknown tokens both 404. */
export const shareApp = new Hono().get("/brief/:token", async (c) => {
  const [row] = await db
    .select({
      dogName: dogs.name,
      summary: briefs.summary,
      status: briefs.status,
      version: briefs.version,
      generatedAt: briefs.generatedAt,
    })
    .from(briefs)
    .innerJoin(dogs, eq(briefs.dogId, dogs.id))
    .where(eq(briefs.shareToken, c.req.param("token")))
    .limit(1);
  if (!row) return c.json({ error: "not_found" } as const, 404);
  await recordEvent("share.brief_viewed", { props: { status: row.status } });
  return c.json({ brief: row });
});
