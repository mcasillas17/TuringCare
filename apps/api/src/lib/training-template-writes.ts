import { trainingCatalog } from "../data/training-catalog";
import { trainingGoals, trainingSkills } from "../db/schema";
import type { TransactionType } from "./safety-lock";

export async function applyTrainingTemplate(
  executor: TransactionType,
  dogId: string,
  templateKey: string,
) {
  const template = trainingCatalog.find((candidate) => candidate.key === templateKey);
  if (!template) return null;

  const [goal] = await executor
    .insert(trainingGoals)
    .values({ dogId, goal: template.name, catalogGoalKey: template.key })
    .returning();
  if (!goal) throw new Error("failed to create template goal");

  const skills = await executor
    .insert(trainingSkills)
    .values(
      template.skills.map((skill, index) => ({
        goalId: goal.id,
        name: skill.name,
        confidence: 1,
        position: index,
        catalogSkillKey: skill.key,
      })),
    )
    .returning();

  return { goal, skills };
}
