import { describe, expect, it } from "vitest";
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

  it("rejects identity fields on strict request payloads", () => {
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

  it("accepts a daily check-in progress action", () => {
    expect(
      guidedSetupProgressActionSchema.safeParse({
        trend: "better",
        note: "Settled faster after dinner.",
      }).success,
    ).toBe(true);
  });
});
