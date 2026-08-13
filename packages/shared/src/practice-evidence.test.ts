import { describe, expect, it } from "vitest";
import {
  type CueSupport,
  type EasingStrategy,
  type PracticeDimension,
  type PracticeDistance,
  type PracticeDistraction,
  type PracticeDurationBand,
  type PracticeEnvironment,
  type PracticeOutcome,
  type SafetySignalType,
  cueSupportValues,
  distanceValues,
  distractionValues,
  durationBandValues,
  easingStrategyValues,
  environmentValues,
  practiceDimensionValues,
  practiceEvidenceSchema,
  practiceOutcomeValues,
  safetySignalValues,
} from "./practice-evidence";

describe("practiceEvidenceSchema", () => {
  it("exports the stable practice evidence vocabularies and types", () => {
    const outcome: PracticeOutcome = "went_well";
    const dimension: PracticeDimension = "distance";
    const cueSupport: CueSupport = "hand_signal";
    const environment: PracticeEnvironment = "yard";
    const distance: PracticeDistance = "few_steps";
    const durationBand: PracticeDurationBand = "about_30_seconds";
    const distraction: PracticeDistraction = "mild";
    const safetySignal: SafetySignalType = "injury_or_pain";
    const easingStrategy: EasingStrategy = "reduce_distractions";

    expect(outcome).toBe("went_well");
    expect(dimension).toBe("distance");
    expect(cueSupport).toBe("hand_signal");
    expect(environment).toBe("yard");
    expect(distance).toBe("few_steps");
    expect(durationBand).toBe("about_30_seconds");
    expect(distraction).toBe("mild");
    expect(safetySignal).toBe("injury_or_pain");
    expect(easingStrategy).toBe("reduce_distractions");
    expect(practiceOutcomeValues).toEqual(["went_well", "mixed", "too_hard"]);
    expect(practiceDimensionValues).toEqual([
      "cue_support",
      "environment",
      "distance",
      "duration",
      "distraction",
    ]);
    expect(cueSupportValues).toEqual(["food_lure", "hand_signal", "verbal_cue", "no_extra_help"]);
    expect(environmentValues).toEqual([
      "home_quiet",
      "home_busy",
      "yard",
      "quiet_outdoor",
      "busy_outdoor",
    ]);
    expect(distanceValues).toEqual([
      "at_side",
      "few_steps",
      "across_room",
      "across_yard",
      "far_away",
    ]);
    expect(durationBandValues).toEqual([
      "under_5_seconds",
      "about_15_seconds",
      "about_30_seconds",
      "one_to_two_minutes",
      "five_to_fifteen_minutes",
      "about_30_minutes",
      "one_to_two_hours",
      "half_day_or_more",
    ]);
    expect(distractionValues).toEqual(["none", "mild", "moderate", "strong"]);
    expect(safetySignalValues).toEqual([
      "aggression_or_bite_risk",
      "injury_or_pain",
      "severe_fear_or_panic",
    ]);
    expect(easingStrategyValues).toEqual([
      "add_cue_help",
      "use_quieter_environment",
      "increase_trigger_distance",
      "decrease_owner_distance",
      "shorten_duration",
      "reduce_distractions",
    ]);
  });

  it("accepts structured practice evidence", () => {
    expect(
      practiceEvidenceSchema.safeParse({
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

  it("rejects values outside the controlled vocabulary", () => {
    expect(practiceEvidenceSchema.safeParse({ outcome: "great" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ distraction: "extreme" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ safetySignal: "bit someone" }).success).toBe(false);
  });

  it("accepts omitted and null evidence fields and rejects invalid practiced target metadata", () => {
    expect(practiceEvidenceSchema.safeParse({}).success).toBe(true);
    expect(
      practiceEvidenceSchema.safeParse({
        outcome: null,
        cueSupport: null,
        environment: null,
        distance: null,
        durationBand: null,
        distraction: null,
        safetySignal: null,
        practicedTarget: null,
      }).success,
    ).toBe(true);
    expect(
      practiceEvidenceSchema.safeParse({
        practicedTarget: {
          suggestionId: "not-a-uuid",
          variant: "backup",
        },
      }).success,
    ).toBe(false);
  });
});
