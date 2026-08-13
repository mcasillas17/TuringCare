import { describe, expect, it } from "vitest";
import { behaviorConcernSchema, dogProfileSchema, trainingGoalSchema } from "./dog";

describe("dogProfileSchema", () => {
  it("accepts a valid profile", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "medium",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
      spayedNeutered: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid size enum", () => {
    const r = dogProfileSchema.safeParse({
      name: "Biscuit",
      size: "enormous",
      sex: "female",
      source: "rescue",
      vaccineStage: "in_progress",
    });
    expect(r.success).toBe(false);
  });

  it("requires a name", () => {
    const r = dogProfileSchema.safeParse({
      size: "small",
      sex: "male",
      source: "breeder",
      vaccineStage: "unknown",
    });
    expect(r.success).toBe(false);
  });
});

describe("behaviorConcernSchema", () => {
  it("accepts a valid concern with a structured safety signal", () => {
    expect(
      behaviorConcernSchema.safeParse({
        concern: "Leash reactivity",
        severity: "moderate",
        safetySignal: "injury_or_pain",
      }).success,
    ).toBe(true);
  });
  it("allows an omitted or null safety signal", () => {
    expect(
      behaviorConcernSchema.safeParse({ concern: "Leash reactivity", severity: "moderate" })
        .success,
    ).toBe(true);
    expect(
      behaviorConcernSchema.safeParse({
        concern: "Leash reactivity",
        severity: "moderate",
        safetySignal: null,
      }).success,
    ).toBe(true);
  });
  it("rejects an empty concern", () => {
    expect(behaviorConcernSchema.safeParse({ concern: "", severity: "mild" }).success).toBe(false);
  });
  it("rejects a bad severity", () => {
    expect(
      behaviorConcernSchema.safeParse({ concern: "Barking", severity: "extreme" }).success,
    ).toBe(false);
  });
  it("rejects a free-form safety signal", () => {
    expect(
      behaviorConcernSchema.safeParse({
        concern: "Barking",
        severity: "moderate",
        safetySignal: "seems scary",
      }).success,
    ).toBe(false);
  });
});

describe("trainingGoalSchema", () => {
  it("accepts a valid goal", () => {
    expect(trainingGoalSchema.safeParse({ goal: "Calm greetings" }).success).toBe(true);
  });
  it("rejects an empty goal", () => {
    expect(trainingGoalSchema.safeParse({ goal: "" }).success).toBe(false);
  });
});
