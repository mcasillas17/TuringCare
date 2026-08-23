import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefs, dogs, journalEntries } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const overviewApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const mine = await db
      .select()
      .from(dogs)
      .where(eq(dogs.ownerId, c.get("userId")));
    const ids = mine.map((d) => d.id);
    const nameById = new Map(mine.map((d) => [d.id, d.name]));
    if (ids.length === 0) {
      return c.json({ dogCount: 0, journalEntryCount: 0, latestBrief: null, recentActivity: [] });
    }
    const [entries, briefRows] = await Promise.all([
      db
        .select()
        .from(journalEntries)
        .where(inArray(journalEntries.dogId, ids))
        .orderBy(desc(journalEntries.occurredAt)),
      db
        .select()
        .from(briefs)
        .where(inArray(briefs.dogId, ids))
        .orderBy(desc(briefs.generatedAt), desc(briefs.version), desc(briefs.id))
        .limit(1),
    ]);
    const [latest] = briefRows;
    return c.json({
      dogCount: mine.length,
      journalEntryCount: entries.length,
      latestBrief: latest
        ? {
            id: latest.id,
            dogId: latest.dogId,
            dogName: nameById.get(latest.dogId) ?? "",
            status: latest.status,
          }
        : null,
      recentActivity: entries.slice(0, 5).map((e) => ({
        dogName: nameById.get(e.dogId) ?? "",
        behavior: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
    });
  });
