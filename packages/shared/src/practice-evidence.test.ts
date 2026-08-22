import { describe, expect, it } from "vitest";
import {
  cueSupportValues,
  distanceValues,
  distractionValues,
  durationBandValues,
  environmentValues,
  practiceDimensionValues,
  practiceEvidenceFields,
  practiceEvidenceSchema,
  practiceOutcomeValues,
  safetySignalValues,
} from "./practice-evidence";

describe("practice evidence vocabularies", () => {
  it("keeps controlled evidence values stable", () => {
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
    expect(practiceEvidenceFields.practicedTarget).toBeDefined();
    expect(
      practiceEvidenceSchema.parse({
        practicedTarget: {
          suggestionId: "00000000-0000-4000-8000-000000000001",
          variant: "fallback",
        },
      }),
    ).toEqual({
      practicedTarget: {
        suggestionId: "00000000-0000-4000-8000-000000000001",
        variant: "fallback",
      },
    });
  });
});

describe("practiceEvidenceSchema", () => {
  it("accepts an entirely empty payload so capture friction can never block a save", () => {
    expect(practiceEvidenceSchema.parse({})).toEqual({});
  });

  it("accepts explicit nulls when owners clear a prior value", () => {
    expect(practiceEvidenceSchema.parse({ outcome: null, distraction: null })).toEqual({
      outcome: null,
      distraction: null,
    });
  });

  it("accepts structured current-level confirmation", () => {
    expect(
      practiceEvidenceSchema.parse({
        outcome: "went_well",
        confirmCurrentLevel: true,
      }),
    ).toEqual({
      outcome: "went_well",
      confirmCurrentLevel: true,
    });
  });

  it("rejects manual and suggestion anchors together", () => {
    expect(
      practiceEvidenceSchema.safeParse({
        confirmCurrentLevel: true,
        practicedTarget: {
          suggestionId: "00000000-0000-4000-8000-000000000001",
          variant: "primary",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects current-level confirmation without structured training evidence", () => {
    expect(
      practiceEvidenceSchema.safeParse({
        confirmCurrentLevel: true,
        safetySignal: "injury_or_pain",
      }).success,
    ).toBe(false);
  });

  it("rejects values outside the controlled vocabulary", () => {
    expect(practiceEvidenceSchema.safeParse({ outcome: "great" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ distraction: "extreme" }).success).toBe(false);
    expect(practiceEvidenceSchema.safeParse({ safetySignal: "bit someone" }).success).toBe(false);
  });
});
