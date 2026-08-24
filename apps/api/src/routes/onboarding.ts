import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { briefSends, briefs, dogs, journalEntries, trainingGoals } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const onboardingApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const owned = await db
      .select({ id: dogs.id })
      .from(dogs)
      .where(eq(dogs.ownerId, userId))
      .orderBy(desc(dogs.createdAt));
    const dogIds = owned.map((d) => d.id);
    const mostRecentDogId = owned[0]?.id ?? null;

    if (dogIds.length === 0) {
      return c.json({
        hasDog: false,
        momentsCount: 0,
        hasGoal: false,
        hasFinalizedBrief: false,
        hasSentBrief: false,
        mostRecentDogId: null,
      });
    }

    const [momentsResult, goalRow, briefRow, sendRow] = await Promise.all([
      db
        .select({ value: count() })
        .from(journalEntries)
        .where(and(inArray(journalEntries.dogId, dogIds), eq(journalEntries.kind, "moment"))),
      db
        .select({ id: trainingGoals.id })
        .from(trainingGoals)
        .where(inArray(trainingGoals.dogId, dogIds))
        .limit(1),
      db
        .select({ id: briefs.id })
        .from(briefs)
        .where(and(inArray(briefs.dogId, dogIds), eq(briefs.status, "finalized")))
        .limit(1),
      db
        .select({ id: briefSends.id })
        .from(briefSends)
        .innerJoin(briefs, eq(briefSends.briefId, briefs.id))
        .where(and(inArray(briefs.dogId, dogIds), isNotNull(briefSends.deliveredAt)))
        .limit(1),
    ]);

    const [firstMoment] = momentsResult;
    return c.json({
      hasDog: true,
      momentsCount: Number(firstMoment?.value ?? 0),
      hasGoal: goalRow.length > 0,
      hasFinalizedBrief: briefRow.length > 0,
      hasSentBrief: sendRow.length > 0,
      mostRecentDogId,
    });
  });
