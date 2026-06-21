import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";

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
async function makeSkill(dogId: string) {
  const [goal] = await db.insert(trainingGoals).values({ dogId, goal: "Recall" }).returning();
  if (!goal) throw new Error("expected goal");
  const [skill] = await db
    .insert(trainingSkills)
    .values({ goalId: goal.id, name: "Sit", confidence: 1 })
    .returning();
  if (!skill) throw new Error("expected skill");
  return skill;
}

describe("dogs: set skill level", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("PUT level sets confidence and returns the skill", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ level: 3 }),
    });
    expect(res.status).toBe(200);
    const { skill: updated } = (await res.json()) as { skill: { confidence: number } };
    expect(updated.confidence).toBe(3);
  });

  it("rejects another user's skill with 404", async () => {
    const owner = await createTestUser();
    users.push(owner);
    const other = await createTestUser();
    users.push(other);
    const dog = await makeDog(owner);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT",
      headers: other.authHeaders,
      body: JSON.stringify({ level: 3 }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an out-of-range level with 400", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    const res = await app.request(`/api/dogs/${dog.id}/skills/${skill.id}/level`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ level: 9 }),
    });
    expect(res.status).toBe(400);
  });
});
