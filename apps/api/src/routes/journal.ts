import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { dogs, journalEntries } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const journalApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const dogId = c.req.query("dogId");

    if (dogId) {
      const [dog] = await db
        .select({ id: dogs.id })
        .from(dogs)
        .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, userId)))
        .limit(1);
      if (!dog) return c.json({ error: "not_found" } as const, 404);
    }

    const rows = await db
      .select({
        entry: journalEntries,
        dog: {
          id: dogs.id,
          name: dogs.name,
        },
      })
      .from(journalEntries)
      .innerJoin(dogs, eq(journalEntries.dogId, dogs.id))
      .where(dogId ? and(eq(dogs.ownerId, userId), eq(dogs.id, dogId)) : eq(dogs.ownerId, userId))
      .orderBy(desc(journalEntries.occurredAt), desc(journalEntries.createdAt));

    return c.json({
      entries: rows.map(({ entry, dog }) => ({ ...entry, dog })),
    });
  });
