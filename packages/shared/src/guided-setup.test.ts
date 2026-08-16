import { describe, expect, it } from "vitest";
import { behaviorConcernSchema, dogProfileSchema } from "./dog";
import { journalDailyCheckInCreateSchema } from "./journal";
import {
  guidedSetupBehaviorActionSchema,
  guidedSetupIntentInputSchema,
  guidedSetupProgressActionSchema,
  guidedSetupStartSchema,
  guidedSetupTrainingActionSchema,
} from "./guided-setup";

describe("guided setup contracts", () => {
  it("accepts the launch intents", () => {
    for (const intent of [
      "understand_behavior",
      "train_skill",
      "track_progress",
    ] as const) {
      expect(guidedSetupIntentInputSchema.safeParse({ intent }).success).toBe(true);
    }
  });

  it("reuses the dog profile contract for setup start", () => {
    const invalidDogProfile = {
      name: "Biscuit",
    };
    const validDogProfile = {
      name: "Biscuit",
      size: "medium",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
    } as const;

    expect(dogProfileSchema.safeParse(invalidDogProfile).success).toBe(false);
    expect(guidedSetupStartSchema.safeParse(invalidDogProfile).success).toBe(false);
    expect(dogProfileSchema.safeParse(validDogProfile).success).toBe(true);
    expect(guidedSetupStartSchema.safeParse(validDogProfile).success).toBe(true);
  });

  it("keeps behavior concern constraints and confirmation refinement", () => {
    const tooLongConcern = {
      concern: "x".repeat(501),
      severity: "moderate",
      safetyConfirmed: true,
    } as const;
    const invalidSeverity = {
      concern: "Barking",
      severity: "extreme",
      safetyConfirmed: true,
    } as const;
    const invalidSafetySignal = {
      concern: "Barking",
      severity: "moderate",
      safetySignal: "seems scary",
      safetyConfirmed: true,
    } as const;

    expect(behaviorConcernSchema.safeParse(tooLongConcern).success).toBe(false);
    expect(guidedSetupBehaviorActionSchema.safeParse(tooLongConcern).success).toBe(false);
    expect(behaviorConcernSchema.safeParse(invalidSeverity).success).toBe(false);
    expect(guidedSetupBehaviorActionSchema.safeParse(invalidSeverity).success).toBe(false);
    expect(behaviorConcernSchema.safeParse(invalidSafetySignal).success).toBe(false);
    expect(guidedSetupBehaviorActionSchema.safeParse(invalidSafetySignal).success).toBe(false);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Snapped when approached",
        severity: "severe",
        safetyConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("reuses daily check-in semantics for progress actions", () => {
    const blankNote = { note: "   ", trend: "better" } as const;
    const missingTrend = { note: "Settled faster after dinner." } as const;

    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        ...blankNote,
      }).success,
    ).toBe(false);
    expect(
      guidedSetupProgressActionSchema.safeParse(blankNote).success,
    ).toBe(false);
    expect(
      journalDailyCheckInCreateSchema.safeParse({
        kind: "daily_checkin",
        ...missingTrend,
      }).success,
    ).toBe(false);
    expect(guidedSetupProgressActionSchema.safeParse(missingTrend).success).toBe(false);
    expect(
      guidedSetupProgressActionSchema.safeParse({
        note: "Settled faster after dinner.",
        trend: "better",
      }).success,
    ).toBe(true);
  });

  it("rejects identity fields on strict request payloads", () => {
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Pulled away from loud noises",
        severity: "mild",
        safetyConfirmed: true,
        userId: "x",
      }).success,
    ).toBe(false);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Pulled away from loud noises",
        severity: "mild",
        safetyConfirmed: true,
        dogId: "x",
      }).success,
    ).toBe(false);
    expect(
      guidedSetupIntentInputSchema.safeParse({ intent: "train_skill", userId: "x" }).success,
    ).toBe(false);
    expect(
      guidedSetupStartSchema.safeParse({
        name: "Biscuit",
        size: "medium",
        sex: "female",
        source: "rescue",
        vaccineStage: "in_progress",
        userId: "x",
      }).success,
    ).toBe(false);
    expect(
      guidedSetupTrainingActionSchema.safeParse({
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: 420,
        dogId: "x",
      }).success,
    ).toBe(false);
    expect(
      guidedSetupProgressActionSchema.safeParse({
        trend: "better",
        note: "Settled faster after dinner.",
        userId: "x",
      }).success,
    ).toBe(false);
  });

  it("requires safety confirmation for severe concerns and structured safety signals", () => {
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Snapped when approached",
        severity: "severe",
        safetyConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Barked at the window",
        severity: "moderate",
        safetySignal: "injury_or_pain",
        safetyConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Barked at the window",
        severity: "mild",
        safetyConfirmed: false,
      }).success,
    ).toBe(true);
    expect(
      guidedSetupBehaviorActionSchema.safeParse({
        concern: "Sniffed the food bowl",
        severity: "moderate",
        safetyConfirmed: false,
      }).success,
    ).toBe(true);
  });

  it("accepts a valid training action", () => {
    expect(
      guidedSetupTrainingActionSchema.safeParse({
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: 420,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid training dates and offsets", () => {
    expect(
      guidedSetupTrainingActionSchema.safeParse({
        templateKey: "puppy-fundamentals",
        weekKey: "2026-8-10",
        timezoneOffsetMinutes: 420,
      }).success,
    ).toBe(false);
    expect(
      guidedSetupTrainingActionSchema.safeParse({
        templateKey: "puppy-fundamentals",
        weekKey: "2026-08-10",
        timezoneOffsetMinutes: 841,
      }).success,
    ).toBe(false);
  });
});
