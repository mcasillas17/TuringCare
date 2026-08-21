import { afterEach, describe, expect, it } from "vitest";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { dogs, practiceSessions, trainingGoals, trainingSkills } from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import { loadContextualProgress } from "./contextual-progress-data";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-21T12:34:56.789Z");

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
} as const;

const baseContext = {
  cueSupport: "hand_signal" as const,
  environment: "home_quiet" as const,
  distance: "across_room" as const,
  durationBand: "about_30_seconds" as const,
  distraction: "mild" as const,
};

type SessionOverrides = Partial<typeof practiceSessions.$inferInsert>;

async function makeSkill(userId: string) {
  const [dog] = await db
    .insert(dogs)
    .values({ ...validDog, ownerId: userId })
    .returning();
  if (!dog) throw new Error("expected dog");

  const [goal] = await db
    .insert(trainingGoals)
    .values({ dogId: dog.id, goal: "Reliable sit" })
    .returning();
  if (!goal) throw new Error("expected goal");

  const [skill] = await db
    .insert(trainingSkills)
    .values({
      goalId: goal.id,
      name: "Sit",
      confidence: 3,
      catalogSkillKey: "basic-manners.sit",
    })
    .returning();
  if (!skill) throw new Error("expected skill");
  return { dog, skill };
}

async function makeSiblingSkill(dogId: string) {
  const [goal] = await db
    .insert(trainingGoals)
    .values({ dogId, goal: "Reliable down" })
    .returning();
  if (!goal) throw new Error("expected goal");

  const [skill] = await db
    .insert(trainingSkills)
    .values({
      goalId: goal.id,
      name: "Down",
      confidence: 3,
      catalogSkillKey: "basic-manners.down",
    })
    .returning();
  if (!skill) throw new Error("expected skill");
  return skill;
}

async function insertSession(skillId: string, overrides: SessionOverrides = {}) {
  const [session] = await db
    .insert(practiceSessions)
    .values({
      skillId,
      occurredAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      outcome: "went_well",
      practiceDay: "2026-08-20",
      curriculumLevel: 3,
      curriculumVersion: CURRICULUM_VERSION,
      ...baseContext,
      ...overrides,
    })
    .returning();
  if (!session) throw new Error("expected practice session");
  return session;
}

describe("loadContextualProgress", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
    for (const user of users.splice(0)) await user.cleanup();
  });

  it("includes the exact lower bound and excludes stale, future, and incomplete evidence", async () => {
    const user = await createTestUser();
    users.push(user);
    const { dog, skill } = await makeSkill(user.userId);
    const siblingSkill = await makeSiblingSkill(dog.id);
    const cutoff = new Date(NOW.getTime() - 21 * DAY_MS);
    const recent = new Date(NOW.getTime() - DAY_MS);

    await insertSession(skill.id, {
      occurredAt: cutoff,
      practiceDay: "2026-07-31",
    });
    await insertSession(skill.id, {
      occurredAt: recent,
      practiceDay: "2026-08-20",
    });
    await insertSession(siblingSkill.id, {
      occurredAt: NOW,
      outcome: "too_hard",
      practiceDay: "2026-08-21",
    });

    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 22 * DAY_MS),
      practiceDay: "2026-07-30",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() + DAY_MS),
      outcome: "too_hard",
      practiceDay: "2026-08-22",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
      curriculumLevel: 2,
      practiceDay: "2026-08-19",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
      curriculumVersion: "obsolete-version",
      practiceDay: "2026-08-18",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
      curriculumLevel: null,
      curriculumVersion: null,
      practiceDay: "2026-08-17",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      outcome: null,
      practiceDay: "2026-08-16",
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 6 * 60 * 60 * 1000),
      practiceDay: null,
    });
    await insertSession(skill.id, {
      occurredAt: new Date(NOW.getTime() - 7 * 60 * 60 * 1000),
      cueSupport: null,
      environment: null,
      distance: null,
      durationBand: null,
      distraction: null,
      practiceDay: "2026-08-15",
    });

    const result = await loadContextualProgress(skill, NOW);

    expect(result.window).toEqual({
      startsAt: cutoff.toISOString(),
      endsAt: NOW.toISOString(),
      days: 21,
    });
    expect(result.strongestContext).toMatchObject({
      context: baseContext,
      status: "reliable",
      successfulDistinctDays: 2,
      latestOutcome: "went_well",
      lastObservedAt: recent.toISOString(),
      lastSuccessfulAt: recent.toISOString(),
    });
    expect(result.nextPracticeAction).toEqual({
      ruleId: "advance_reliable_context",
      direction: "harder",
      context: { ...baseContext, environment: "home_busy" },
      changedDimension: "environment",
    });
    expect(result.exactContexts).toEqual([
      expect.objectContaining({
        context: baseContext,
        status: "reliable",
        successfulDistinctDays: 2,
        lastObservedAt: recent.toISOString(),
      }),
      expect.objectContaining({
        context: { ...baseContext, environment: "home_busy" },
        status: "not_observed",
      }),
    ]);
  });
});
