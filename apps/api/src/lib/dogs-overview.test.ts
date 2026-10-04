import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { briefs, journalEntries, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { loadDogsOverview } from "./dogs-overview";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};
async function makeDog(u: TestUser) {
  const r = await app.request("/api/dogs", {
    method: "POST",
    headers: u.authHeaders,
    body: JSON.stringify(validDog),
  });
  return ((await r.json()) as { dog: { id: string } }).dog;
}

describe("loadDogsOverview", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("returns per-dog summary aggregates", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const [goal] = await db
      .insert(trainingGoals)
      .values({ dogId: dog.id, goal: "Recall" })
      .returning();
    if (!goal) throw new Error("goal");
    await db.insert(trainingSkills).values([
      { goalId: goal.id, name: "Sit", confidence: 3, position: 0 },
      { goalId: goal.id, name: "Down", confidence: 2, position: 1 },
    ]);
    await db.insert(journalEntries).values({
      dogId: dog.id,
      kind: "moment",
      note: "barked",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
    });
    await db.insert(briefs).values({ dogId: dog.id, status: "draft", summary: "x", version: 2 });

    const overview = await loadDogsOverview(u.userId);
    const row = overview.find((d) => d.id === dog.id);
    expect(row?.summary).toMatchObject({
      journalCount: 1,
      goalCount: 1,
      skillCount: 2,
      avgLevel: 2.5,
      briefStatus: "draft",
      briefVersion: 2,
    });
    expect(typeof row?.summary.lastActivityAt).toBe("string");
  });

  it("returns zeros/nulls for a dog with no goals/journal/brief", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const overview = await loadDogsOverview(u.userId);
    const row = overview.find((d) => d.id === dog.id);
    expect(row?.summary).toEqual({
      journalCount: 0,
      lastActivityAt: null,
      goalCount: 0,
      skillCount: 0,
      avgLevel: null,
      briefStatus: null,
      briefVersion: null,
    });
  });

  it("uses the greatest per-dog Brief version even when timestamps arrive out of order", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    await db.insert(briefs).values([
      {
        dogId: dog.id,
        status: "finalized",
        summary: "older version with later timestamp",
        version: 1,
        generatedAt: new Date("2026-06-11T10:00:00Z"),
      },
      {
        dogId: dog.id,
        status: "draft",
        summary: "latest version",
        version: 2,
        generatedAt: new Date("2026-06-10T10:00:00Z"),
      },
    ]);

    const overview = await loadDogsOverview(u.userId);
    expect(overview.find((row) => row.id === dog.id)?.summary).toMatchObject({
      briefStatus: "draft",
      briefVersion: 2,
    });
  });

  it("only includes the owner's dogs", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dogA = await makeDog(a);
    const overview = await loadDogsOverview(b.userId);
    expect(overview.find((d) => d.id === dogA.id)).toBeUndefined();
  });
});
