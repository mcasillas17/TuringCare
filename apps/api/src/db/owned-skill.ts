import { and, eq } from "drizzle-orm";
import { db } from ".";
import { dogs, trainingGoals, trainingSkills } from "./schema";

export async function findOwnedSkill(userId: string, dogId: string, skillId: string) {
  const rows = await db
    .select({
      id: trainingSkills.id,
      goalId: trainingSkills.goalId,
      name: trainingSkills.name,
      confidence: trainingSkills.confidence,
      position: trainingSkills.position,
      createdAt: trainingSkills.createdAt,
    })
    .from(trainingSkills)
    .innerJoin(trainingGoals, eq(trainingSkills.goalId, trainingGoals.id))
    .innerJoin(dogs, eq(trainingGoals.dogId, dogs.id))
    .where(
      and(eq(trainingSkills.id, skillId), eq(trainingGoals.dogId, dogId), eq(dogs.ownerId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}
