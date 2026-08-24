import { and, desc, eq, inArray, max } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { resolveLatestBriefRowsByKey } from "../db/latest-brief";
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
      return c.json({
        dogCount: 0,
        journalEntryCount: 0,
        latestBrief: null,
        latestBriefAmbiguous: false,
        recentActivity: [],
      });
    }
    const latestBriefVersions = db
      .select({ dogId: briefs.dogId, maxVersion: max(briefs.version).as("max_version") })
      .from(briefs)
      .where(inArray(briefs.dogId, ids))
      .groupBy(briefs.dogId)
      .as("latest_brief_versions");
    const [entries, briefRows] = await Promise.all([
      db
        .select()
        .from(journalEntries)
        .where(inArray(journalEntries.dogId, ids))
        .orderBy(desc(journalEntries.occurredAt)),
      db
        .select({
          id: briefs.id,
          dogId: briefs.dogId,
          status: briefs.status,
          version: briefs.version,
          generatedAt: briefs.generatedAt,
        })
        .from(briefs)
        .innerJoin(
          latestBriefVersions,
          and(
            eq(briefs.dogId, latestBriefVersions.dogId),
            eq(briefs.version, latestBriefVersions.maxVersion),
          ),
        )
        .where(inArray(briefs.dogId, ids))
        .orderBy(desc(briefs.version), desc(briefs.generatedAt), desc(briefs.id)),
    ]);
    const latestByDog = resolveLatestBriefRowsByKey(briefRows, (brief) => brief.dogId);
    const latestBriefAmbiguous = [...latestByDog.values()].some(
      (resolution) => resolution.kind === "conflict",
    );
    const latest = latestBriefAmbiguous
      ? undefined
      : [...latestByDog.values()]
          .flatMap((resolution) => (resolution.kind === "found" ? [resolution.brief] : []))
          .toSorted(
            (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime() || b.id.localeCompare(a.id),
          )[0];
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
      latestBriefAmbiguous,
      recentActivity: entries.slice(0, 5).map((e) => ({
        dogName: nameById.get(e.dogId) ?? "",
        behavior: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
    });
  });
