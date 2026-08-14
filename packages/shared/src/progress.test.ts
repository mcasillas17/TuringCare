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
  it("accepts a bare session", () => {
    expect(practiceSessionSchema.safeParse({ occurredAt: "2026-05-22T10:00" }).success).toBe(true);
  });

  it("accepts full structured practice evidence", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        durationMinutes: 15,
        notes: "Held sit through two knocks",
        timezoneOffsetMinutes: -420,
        outcome: "went_well",
        cueSupport: "hand_signal",
        environment: "yard",
        distance: "few_steps",
        durationBand: "about_30_seconds",
        distraction: "mild",
        safetySignal: "injury_or_pain",
        practicedTarget: {
          suggestionId: "07f8f6f4-3f8d-4f47-8f08-65f5d4c207f0",
          variant: "primary",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid outcome", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        outcome: "great",
      }).success,
    ).toBe(false);
  });

  it("accepts api timestamps with offsets and legacy local minute strings", () => {
    expect(
      practiceSessionApiSchema.safeParse({ occurredAt: "2026-05-22T10:00:00-07:00" }).success,
    ).toBe(true);
    expect(practiceSessionApiSchema.safeParse({ occurredAt: "2026-05-22T10:00" }).success).toBe(
      true,
    );
  });

  it("rejects invalid duration, invalid timezone offset, and non-string notes", () => {
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        durationMinutes: -1,
      }).success,
    ).toBe(false);
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        timezoneOffsetMinutes: 900,
      }).success,
    ).toBe(false);
    expect(
      practiceSessionSchema.safeParse({
        occurredAt: "2026-05-22T10:00",
        notes: 7,
      }).success,
    ).toBe(false);
  });
});
