import { afterEach, describe, expect, it } from "vitest";
import { db } from ".";
import { type TestUser, createTestUser } from "../test-helpers";
import { findOwnedSkill } from "./owned-skill";
import { dogs, trainingGoals, trainingSkills } from "./schema";

const validDog = {
  name: "Biscuit",
  size: "medium" as const,
  sex: "female" as const,
  source: "rescue" as const,
  vaccineStage: "in_progress" as const,
  spayedNeutered: true,
};

describe("findOwnedSkill", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    for (let u = users.pop(); u; u = users.pop()) await u.cleanup();
  });

  async function seedSkill(u: TestUser) {
    const [dog] = await db
      .insert(dogs)
      .values({ ...validDog, ownerId: u.userId })
      .returning();
    if (!dog) throw new Error("expected dog");
    const [goal] = await db
      .insert(trainingGoals)
      .values({ dogId: dog.id, goal: "Calm greetings" })
      .returning();
    if (!goal) throw new Error("expected goal");
    const [skill] = await db
      .insert(trainingSkills)
      .values({ goalId: goal.id, name: "Door-knock threshold", confidence: 2 })
      .returning();
    if (!skill) throw new Error("expected skill");
    return { dog, goal, skill };
  }

  it("returns a skill only when user, dog, and skill all match", async () => {
    const u = await createTestUser();
    users.push(u);
    const { dog, goal, skill } = await seedSkill(u);
    await expect(findOwnedSkill(u.userId, dog.id, skill.id)).resolves.toMatchObject({
      id: skill.id,
      goalId: goal.id,
    });
  });

  it("returns null for another owner and for a different dog path", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const seeded = await seedSkill(a);
    const other = await seedSkill(a);
    await expect(findOwnedSkill(b.userId, seeded.dog.id, seeded.skill.id)).resolves.toBeNull();
    await expect(findOwnedSkill(a.userId, other.dog.id, seeded.skill.id)).resolves.toBeNull();
  });
});
