import { and, eq } from "drizzle-orm";
import { db } from ".";
import { dogs, trainingGoals, trainingSkills } from "./schema";

type OwnedSkillExecutor = Pick<typeof db, "select">;

export async function findOwnedSkill(
  userId: string,
  dogId: string,
  skillId: string,
  executor: OwnedSkillExecutor = db,
  lock: "share" | undefined = undefined,
) {
  const query = executor
    .select({
      id: trainingSkills.id,
      goalId: trainingSkills.goalId,
      name: trainingSkills.name,
      confidence: trainingSkills.confidence,
      catalogSkillKey: trainingSkills.catalogSkillKey,
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
  const rows = lock === "share" ? await query.for("share") : await query;
  return rows[0] ?? null;
}
