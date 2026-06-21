import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { db } from "../db";
import { skillMilestones, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { loadProgress } from "./progress";
import { setSkillLevel } from "./skill-level";

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

describe("setSkillLevel", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  it("sets confidence and records reachedAt for newly-reached levels", async () => {
    const u = await createTestUser();
    users.push(u);
    const skill = await makeSkill((await makeDog(u)).id);

    await setSkillLevel(skill.id, 3);

    const [row] = await db.select().from(trainingSkills).where(eq(trainingSkills.id, skill.id));
    expect(row?.confidence).toBe(3);
    const ms = await db.select().from(skillMilestones).where(eq(skillMilestones.skillId, skill.id));
    expect(ms.map((m) => m.level).sort()).toEqual([2, 3]); // level 1 is baseline, never recorded
  });

  it("is idempotent — re-setting does not duplicate rows, and lowering keeps dates", async () => {
    const u = await createTestUser();
    users.push(u);
    const skill = await makeSkill((await makeDog(u)).id);
    await setSkillLevel(skill.id, 4);
    await setSkillLevel(skill.id, 2); // lower
    const ms = await db.select().from(skillMilestones).where(eq(skillMilestones.skillId, skill.id));
    expect(ms.map((m) => m.level).sort()).toEqual([2, 3, 4]); // dates kept
    const [row] = await db.select().from(trainingSkills).where(eq(trainingSkills.id, skill.id));
    expect(row?.confidence).toBe(2);
  });

  it("loadProgress returns milestones ascending", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const skill = await makeSkill(dog.id);
    await setSkillLevel(skill.id, 3);
    const progress = await loadProgress(dog.id);
    const loaded = progress.goals[0]?.skills[0];
    expect(loaded?.confidence).toBe(3);
    expect(loaded?.milestones.map((m) => m.level)).toEqual([2, 3]);
    expect(typeof loaded?.milestones[0]?.reachedAt).toBe("string");
  });
});
