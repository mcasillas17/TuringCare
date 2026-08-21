import { describe, expect, it } from "vitest";
import {
  practiceSessionApiSchema,
  practiceSessionSchema,
  skillLevelSchema,
  trainingSkillSchema,
} from "./progress";

describe("trainingSkillSchema", () => {
  it("accepts a valid skill with confidence", () => {
    expect(
      trainingSkillSchema.safeParse({ name: "Door-knock threshold", confidence: 3 }).success,
    ).toBe(true);
  });

  it("rejects an empty trimmed name, overlong name, and out-of-range confidence", () => {
    expect(trainingSkillSchema.safeParse({ name: "   ", confidence: 3 }).success).toBe(false);
    expect(trainingSkillSchema.safeParse({ name: "x".repeat(121), confidence: 3 }).success).toBe(
      false,
    );
    expect(trainingSkillSchema.safeParse({ name: "Mat settle", confidence: 6 }).success).toBe(
      false,
    );
  });
});

describe("skillLevelSchema", () => {
  it("accepts levels 1..5", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(skillLevelSchema.parse({ level }).level).toBe(level);
    }
  });
  it("rejects out-of-range and non-integers", () => {
    expect(skillLevelSchema.safeParse({ level: 0 }).success).toBe(false);
    expect(skillLevelSchema.safeParse({ level: 6 }).success).toBe(false);
    expect(skillLevelSchema.safeParse({ level: 2.5 }).success).toBe(false);
  });
});

describe("practiceSessionSchema", () => {
  it("accepts occurredAt with optional duration and notes", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        durationMinutes: 15,
        notes: "Held sit through two knocks",
      }).success,
    ).toBe(true);
    expect(practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00" }).success).toBe(true);
  });

  it("rejects invalid duration and non-string notes", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        durationMinutes: -1,
      }).success,
    ).toBe(false);
    expect(
      practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00", notes: 7 }).success,
    ).toBe(false);
  });

  it("accepts structured manual confirmation and rejects combined anchors", () => {
    expect(
      practiceSessionSchema.parse({
        occurredAt: "2026-05-22T10:00",
        outcome: "went_well",
        cueSupport: "verbal_cue",
        confirmCurrentLevel: true,
      }),
    ).toEqual({
      occurredAt: "2026-05-22T10:00",
      outcome: "went_well",
      cueSupport: "verbal_cue",
      confirmCurrentLevel: true,
    });

    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        confirmCurrentLevel: true,
        practicedTarget: {
          suggestionId: "00000000-0000-4000-8000-000000000001",
          variant: "primary",
        },
      }).success,
    ).toBe(false);
  });
});

describe("practiceSessionApiSchema", () => {
  it("still accepts the existing ISO and legacy timestamp formats", () => {
    expect(
      practiceSessionApiSchema.safeParse({
        occurredAt: "2026-05-22T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      practiceSessionApiSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
      }).success,
    ).toBe(true);
    expect(
      practiceSessionApiSchema.safeParse({
        occurredAt: "2026-05-22T10:00:00-04:00",
      }).success,
    ).toBe(true);
  });
});
