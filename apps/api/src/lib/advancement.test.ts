import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../db";
import {
  advancementProposals,
  dogs,
  practiceSessions,
  trainingGoals,
  trainingSkills,
} from "../db/schema";
import { type TestUser, createTestUser } from "../test-helpers";
import {
  ADVANCEMENT_MIN_DAYS,
  ADVANCEMENT_MIN_SESSIONS,
  type AdvancementInputs,
  evaluateAdvancement,
  syncAdvancementProposal,
} from "./advancement";

const day = (iso: string) => new Date(iso);

const base: AdvancementInputs = {
  ruleId: "maintain_current_level",
  level: 3,
  outcomes: [],
};

async function createSkill(user: TestUser) {
  const [dog] = await db
    .insert(dogs)
    .values({
      ownerId: user.userId,
      name: "Biscuit",
      size: "medium",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
      spayedNeutered: true,
    })
    .returning();
  if (!dog) throw new Error("expected dog");
  const [goal] = await db
    .insert(trainingGoals)
    .values({ dogId: dog.id, goal: "Recall" })
    .returning();
  if (!goal) throw new Error("expected goal");
  const [skill] = await db
    .insert(trainingSkills)
    .values({ goalId: goal.id, name: "Sit", confidence: 2 })
    .returning();
  if (!skill) throw new Error("expected skill");
  return skill;
}

describe("evaluateAdvancement", () => {
  it("requires three consecutive good sessions across two days", () => {
    expect(ADVANCEMENT_MIN_SESSIONS).toBe(3);
    expect(ADVANCEMENT_MIN_DAYS).toBe(2);

    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toEqual({
      fromLevel: 3,
      toLevel: 4,
      sessionCount: 3,
      dayCount: 3,
      lastSessionAt: day("2026-08-13T09:00:00.000Z"),
      lastSessionId: null,
    });
  });

  describe("syncAdvancementProposal", () => {
    const users: TestUser[] = [];
    afterEach(async () => {
      for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
    });

    it("suppresses a reproposal when an older tied terminal decision covers current evidence", async () => {
      const user = await createTestUser();
      users.push(user);
      const skill = await createSkill(user);
      const newestAt = day("2026-08-13T09:00:00.000Z");
      const evidenceRows = [
        {
          id: randomUUID(),
          outcome: "went_well" as const,
          occurredAt: newestAt,
          practiceDay: "2026-08-13",
        },
        {
          id: randomUUID(),
          outcome: "went_well" as const,
          occurredAt: day("2026-08-12T09:00:00.000Z"),
          practiceDay: "2026-08-12",
        },
        {
          id: randomUUID(),
          outcome: "went_well" as const,
          occurredAt: day("2026-08-11T09:00:00.000Z"),
          practiceDay: "2026-08-11",
        },
      ];
      const [newestEvidence, middleEvidence, oldestEvidence] = evidenceRows;
      if (!newestEvidence || !middleEvidence || !oldestEvidence) {
        throw new Error("expected qualifying evidence");
      }
      const tiedEvidenceId = randomUUID();
      await db.insert(practiceSessions).values([
        ...evidenceRows.map((row) => ({
          ...row,
          skillId: skill.id,
          curriculumLevel: 2,
          practiceVariant: "primary" as const,
        })),
        {
          id: tiedEvidenceId,
          skillId: skill.id,
          outcome: "went_well",
          occurredAt: newestAt,
          practiceDay: "2026-08-13",
          curriculumLevel: 2,
          practiceVariant: "primary",
        },
      ]);

      const decision = {
        skillId: skill.id,
        fromLevel: 2,
        toLevel: 3,
        ruleId: "maintain_current_level",
        evidenceSessionCount: 3,
        evidenceDayCount: 3,
        evidenceWindowDays: 14,
        evidenceOccurredAt: evidenceRows.map((row) => row.occurredAt),
        evidencePracticeDays: evidenceRows.map((row) => row.practiceDay),
        evidenceOutcomes: evidenceRows.map((row) => row.outcome),
        evidenceLastSessionAt: newestAt,
      };
      await db.insert(advancementProposals).values([
        {
          ...decision,
          evidenceSessionIds: evidenceRows.map((row) => row.id),
          status: "rejected",
          createdAt: day("2026-08-13T10:00:00.000Z"),
        },
        {
          ...decision,
          evidenceSessionIds: [tiedEvidenceId, middleEvidence.id, oldestEvidence.id],
          status: "stayed",
          createdAt: day("2026-08-13T11:00:00.000Z"),
        },
      ]);

      const result = await syncAdvancementProposal(
        skill.id,
        {
          fromLevel: 2,
          toLevel: 3,
          sessionCount: 3,
          dayCount: 3,
          lastSessionAt: newestAt,
          lastSessionId: newestEvidence.id,
        },
        evidenceRows,
      );

      expect(result).toEqual({ proposal: null, created: false });
      expect(
        await db
          .select()
          .from(advancementProposals)
          .where(eq(advancementProposals.skillId, skill.id)),
      ).toHaveLength(2);
    });
  });

  it("uses practice days or UTC dates to count distinct days", () => {
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        {
          outcome: "went_well",
          occurredAt: day("2026-08-13T01:00:00.000Z"),
          practiceDay: "2026-08-12",
        },
        {
          outcome: "went_well",
          occurredAt: day("2026-08-13T02:00:00.000Z"),
          practiceDay: "2026-08-13",
        },
        { outcome: "went_well", occurredAt: day("2026-08-11T23:00:00.000Z") },
      ],
    });

    expect(result?.dayCount).toBe(3);
  });

  it("does not propose when the good sessions all happened on one day", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T12:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-13T18:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose when a newest session was not a success", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "mixed", occurredAt: day("2026-08-12T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose with fewer than three sessions", () => {
    expect(
      evaluateAdvancement({
        ...base,
        outcomes: [
          { outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
          { outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        ],
      }),
    ).toBeNull();
  });

  it("does not propose unless the rule is maintain_current_level", () => {
    const outcomes = [
      { outcome: "went_well" as const, occurredAt: day("2026-08-13T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-12T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-11T09:00:00.000Z") },
    ];
    for (const ruleId of [
      "hold_after_mixed",
      "step_back_after_too_hard",
      "ease_after_harder_checkin",
      "ease_after_hard_context",
      "cold_start_curriculum_level",
    ] as const) {
      expect(evaluateAdvancement({ ...base, ruleId, outcomes })).toBeNull();
    }
  });

  it("does not propose past level five", () => {
    const outcomes = [
      { outcome: "went_well" as const, occurredAt: day("2026-08-13T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-12T09:00:00.000Z") },
      { outcome: "went_well" as const, occurredAt: day("2026-08-11T09:00:00.000Z") },
    ];
    expect(evaluateAdvancement({ ...base, level: 5, outcomes })).toBeNull();
    expect(evaluateAdvancement({ ...base, level: 99, outcomes })).toBeNull();
  });

  it("reports only the three newest qualifying successes as proposal evidence", () => {
    const result = evaluateAdvancement({
      ...base,
      outcomes: [
        { id: "newest", outcome: "went_well", occurredAt: day("2026-08-13T09:00:00.000Z") },
        { id: "middle", outcome: "went_well", occurredAt: day("2026-08-12T09:00:00.000Z") },
        { id: "oldest", outcome: "went_well", occurredAt: day("2026-08-11T09:00:00.000Z") },
        { id: "ignored", outcome: "mixed", occurredAt: day("2026-08-10T09:00:00.000Z") },
      ],
    });

    expect(result).toMatchObject({
      sessionCount: 3,
      dayCount: 3,
      lastSessionId: "newest",
    });
  });
});
