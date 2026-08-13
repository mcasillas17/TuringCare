import { eq } from "drizzle-orm";
import { type DB, db } from "../db";
import { skillMilestones, trainingSkills } from "../db/schema";

type SkillLevelDatabase = Pick<DB, "update" | "select" | "insert">;

/**
 * Set a skill's current level (1–5) and record `reachedAt` for any newly-reached
 * levels (2..level). Lowering the level records/deletes nothing — earned dates
 * are kept. Returns the updated skill row.
 */
export async function setSkillLevel(
  skillId: string,
  level: number,
  database: SkillLevelDatabase = db,
) {
  const [updated] = await database
    .update(trainingSkills)
    .set({ confidence: level })
    .where(eq(trainingSkills.id, skillId))
    .returning();
  if (!updated) throw new Error("failed to set skill level");

  if (level >= 2) {
    const existing = await database
      .select({ level: skillMilestones.level })
      .from(skillMilestones)
      .where(eq(skillMilestones.skillId, skillId));
    const have = new Set(existing.map((row) => row.level));
    const toInsert = [];
    for (let lvl = 2; lvl <= level; lvl++) {
      if (!have.has(lvl)) toInsert.push({ skillId, level: lvl });
    }
    // onConflictDoNothing guards against a concurrent double-tap inserting the
    // same (skillId, level) and tripping the unique constraint.
    if (toInsert.length > 0)
      await database.insert(skillMilestones).values(toInsert).onConflictDoNothing();
  }
  return updated;
}
