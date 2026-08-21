import type {
  ExactPracticeContext,
  PracticeDimension,
  SkillDimensionMetadata,
} from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import type { AdjacentContext } from "./context-adjacency";
import { adjacentContext, isContextNoHarderThan } from "./context-adjacency";

const contextKeys = [
  "cueSupport",
  "environment",
  "distance",
  "durationBand",
  "distraction",
] as const;

type ContextKey = (typeof contextKeys)[number];

function createBaseContext(): ExactPracticeContext {
  return {
    cueSupport: "hand_signal",
    environment: "home_busy",
    distance: "across_room",
    durationBand: "about_30_seconds",
    distraction: "mild",
  };
}

const increaseTriggerDistanceMetadata: SkillDimensionMetadata = {
  dimensions: ["distance"],
  levelSteps: ["distance", "distance", "distance", "distance"],
  levelStepStrategies: [
    "increase_trigger_distance",
    "increase_trigger_distance",
    "increase_trigger_distance",
    "increase_trigger_distance",
  ],
  baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
};

const decreaseOwnerDistanceMetadata: SkillDimensionMetadata = {
  dimensions: ["distance"],
  levelSteps: ["distance", "distance", "distance", "distance"],
  levelStepStrategies: [
    "decrease_owner_distance",
    "decrease_owner_distance",
    "decrease_owner_distance",
    "decrease_owner_distance",
  ],
  baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
};

function expectExactOneFieldChange<K extends ContextKey>(
  source: ExactPracticeContext,
  original: ExactPracticeContext,
  result: AdjacentContext | null,
  changedDimension: PracticeDimension,
  changedField: K,
  expectedValue: ExactPracticeContext[K],
) {
  expect(result).not.toBeNull();
  if (!result) return;

  expect(result.changedDimension).toBe(changedDimension);
  expect(result.context).not.toBe(source);
  expect(source).toEqual(original);

  const changedKeys = contextKeys.filter((key) => result.context[key] !== source[key]);
  expect(changedKeys).toEqual([changedField]);
  expect(result.context[changedField]).toBe(expectedValue);
}

describe("adjacentContext", () => {
  it("moves distraction one step harder or easier and respects both boundaries", () => {
    const harderBase = createBaseContext();
    const harderOriginal = { ...harderBase };
    expectExactOneFieldChange(
      harderBase,
      harderOriginal,
      adjacentContext(harderBase, "distraction", "harder", "reduce_distractions"),
      "distraction",
      "distraction",
      "moderate",
    );

    const easierBase = createBaseContext();
    const easierOriginal = { ...easierBase };
    expectExactOneFieldChange(
      easierBase,
      easierOriginal,
      adjacentContext(easierBase, "distraction", "easier", "reduce_distractions"),
      "distraction",
      "distraction",
      "none",
    );

    expect(
      adjacentContext(
        { ...createBaseContext(), distraction: "none" },
        "distraction",
        "easier",
        "reduce_distractions",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), distraction: "strong" },
        "distraction",
        "harder",
        "reduce_distractions",
      ),
    ).toBeNull();
  });

  it("moves cue support one step in either direction and returns null at the boundaries", () => {
    const easierBase = createBaseContext();
    const easierOriginal = { ...easierBase };
    expectExactOneFieldChange(
      easierBase,
      easierOriginal,
      adjacentContext(easierBase, "cue_support", "easier", "add_cue_help"),
      "cue_support",
      "cueSupport",
      "food_lure",
    );

    const harderBase = createBaseContext();
    const harderOriginal = { ...harderBase };
    expectExactOneFieldChange(
      harderBase,
      harderOriginal,
      adjacentContext(harderBase, "cue_support", "harder", "add_cue_help"),
      "cue_support",
      "cueSupport",
      "verbal_cue",
    );

    expect(
      adjacentContext(
        { ...createBaseContext(), cueSupport: "food_lure" },
        "cue_support",
        "easier",
        "add_cue_help",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), cueSupport: "no_extra_help" },
        "cue_support",
        "harder",
        "add_cue_help",
      ),
    ).toBeNull();
  });

  it("moves environment one step in either direction and returns null at the boundaries", () => {
    const easierBase = createBaseContext();
    const easierOriginal = { ...easierBase };
    expectExactOneFieldChange(
      easierBase,
      easierOriginal,
      adjacentContext(easierBase, "environment", "easier", "use_quieter_environment"),
      "environment",
      "environment",
      "home_quiet",
    );

    const harderBase = createBaseContext();
    const harderOriginal = { ...harderBase };
    expectExactOneFieldChange(
      harderBase,
      harderOriginal,
      adjacentContext(harderBase, "environment", "harder", "use_quieter_environment"),
      "environment",
      "environment",
      "yard",
    );

    expect(
      adjacentContext(
        { ...createBaseContext(), environment: "home_quiet" },
        "environment",
        "easier",
        "use_quieter_environment",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), environment: "busy_outdoor" },
        "environment",
        "harder",
        "use_quieter_environment",
      ),
    ).toBeNull();
  });

  it("maps duration to durationBand and moves one step in either direction", () => {
    const easierBase = createBaseContext();
    const easierOriginal = { ...easierBase };
    expectExactOneFieldChange(
      easierBase,
      easierOriginal,
      adjacentContext(easierBase, "duration", "easier", "shorten_duration"),
      "duration",
      "durationBand",
      "about_15_seconds",
    );

    const harderBase = createBaseContext();
    const harderOriginal = { ...harderBase };
    expectExactOneFieldChange(
      harderBase,
      harderOriginal,
      adjacentContext(harderBase, "duration", "harder", "shorten_duration"),
      "duration",
      "durationBand",
      "one_to_two_minutes",
    );

    expect(
      adjacentContext(
        { ...createBaseContext(), durationBand: "under_5_seconds" },
        "duration",
        "easier",
        "shorten_duration",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), durationBand: "half_day_or_more" },
        "duration",
        "harder",
        "shorten_duration",
      ),
    ).toBeNull();
  });

  it("moves distance according to the reviewed strategy family", () => {
    const increaseEasierBase = createBaseContext();
    const increaseEasierOriginal = { ...increaseEasierBase };
    expectExactOneFieldChange(
      increaseEasierBase,
      increaseEasierOriginal,
      adjacentContext(increaseEasierBase, "distance", "easier", "increase_trigger_distance"),
      "distance",
      "distance",
      "across_yard",
    );

    const increaseHarderBase = createBaseContext();
    const increaseHarderOriginal = { ...increaseHarderBase };
    expectExactOneFieldChange(
      increaseHarderBase,
      increaseHarderOriginal,
      adjacentContext(increaseHarderBase, "distance", "harder", "increase_trigger_distance"),
      "distance",
      "distance",
      "few_steps",
    );

    const decreaseEasierBase = createBaseContext();
    const decreaseEasierOriginal = { ...decreaseEasierBase };
    expectExactOneFieldChange(
      decreaseEasierBase,
      decreaseEasierOriginal,
      adjacentContext(decreaseEasierBase, "distance", "easier", "decrease_owner_distance"),
      "distance",
      "distance",
      "few_steps",
    );

    const decreaseHarderBase = createBaseContext();
    const decreaseHarderOriginal = { ...decreaseHarderBase };
    expectExactOneFieldChange(
      decreaseHarderBase,
      decreaseHarderOriginal,
      adjacentContext(decreaseHarderBase, "distance", "harder", "decrease_owner_distance"),
      "distance",
      "distance",
      "across_yard",
    );
  });

  it("returns null when the selected context value is missing", () => {
    expect(
      adjacentContext(
        { ...createBaseContext(), cueSupport: null },
        "cue_support",
        "easier",
        "add_cue_help",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), environment: null },
        "environment",
        "easier",
        "use_quieter_environment",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distance: null },
        "distance",
        "easier",
        "increase_trigger_distance",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), durationBand: null },
        "duration",
        "easier",
        "shorten_duration",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distraction: null },
        "distraction",
        "easier",
        "reduce_distractions",
      ),
    ).toBeNull();
  });

  it("returns null on every selected-field boundary", () => {
    expect(
      adjacentContext(
        { ...createBaseContext(), cueSupport: "food_lure" },
        "cue_support",
        "easier",
        "add_cue_help",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), cueSupport: "no_extra_help" },
        "cue_support",
        "harder",
        "add_cue_help",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), environment: "home_quiet" },
        "environment",
        "easier",
        "use_quieter_environment",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), environment: "busy_outdoor" },
        "environment",
        "harder",
        "use_quieter_environment",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), durationBand: "under_5_seconds" },
        "duration",
        "easier",
        "shorten_duration",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), durationBand: "half_day_or_more" },
        "duration",
        "harder",
        "shorten_duration",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), distraction: "none" },
        "distraction",
        "easier",
        "reduce_distractions",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distraction: "strong" },
        "distraction",
        "harder",
        "reduce_distractions",
      ),
    ).toBeNull();

    expect(
      adjacentContext(
        { ...createBaseContext(), distance: "at_side" },
        "distance",
        "harder",
        "increase_trigger_distance",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distance: "far_away" },
        "distance",
        "easier",
        "increase_trigger_distance",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distance: "at_side" },
        "distance",
        "easier",
        "decrease_owner_distance",
      ),
    ).toBeNull();
    expect(
      adjacentContext(
        { ...createBaseContext(), distance: "far_away" },
        "distance",
        "harder",
        "decrease_owner_distance",
      ),
    ).toBeNull();
  });

  it("returns null when the strategy does not belong to the selected dimension", () => {
    expect(
      adjacentContext(createBaseContext(), "cue_support", "easier", "shorten_duration"),
    ).toBeNull();
    expect(
      adjacentContext(createBaseContext(), "environment", "harder", "reduce_distractions"),
    ).toBeNull();
    expect(adjacentContext(createBaseContext(), "duration", "easier", "add_cue_help")).toBeNull();
    expect(
      adjacentContext(createBaseContext(), "distraction", "harder", "use_quieter_environment"),
    ).toBeNull();
    expect(adjacentContext(createBaseContext(), "distance", "easier", "add_cue_help")).toBeNull();
  });
});

describe("isContextNoHarderThan", () => {
  it("accepts a candidate that is equal or easier across multiple controlled dimensions", () => {
    const failed = createBaseContext();
    const candidate = {
      ...failed,
      cueSupport: "food_lure",
      environment: "home_quiet",
      durationBand: "about_15_seconds",
      distraction: "none",
    } as const;

    expect(isContextNoHarderThan(candidate, failed, null)).toBe(true);
  });

  it("rejects a candidate that is harder in any controlled dimension", () => {
    const failed = createBaseContext();
    const candidate = {
      ...failed,
      cueSupport: "food_lure",
      environment: "home_quiet",
      durationBand: "one_to_two_minutes",
      distraction: "none",
    } as const;

    expect(isContextNoHarderThan(candidate, failed, null)).toBe(false);
  });

  it("rejects null mismatches while accepting equally unknown fields", () => {
    const failed = { ...createBaseContext(), environment: null, distance: null };

    expect(isContextNoHarderThan({ ...failed }, failed, null)).toBe(true);
    expect(isContextNoHarderThan({ ...failed, environment: "home_quiet" }, failed, null)).toBe(
      false,
    );
    expect(
      isContextNoHarderThan(
        { ...createBaseContext(), environment: null },
        createBaseContext(),
        null,
      ),
    ).toBe(false);
  });

  it("uses the reviewed distance strategy when deciding whether a candidate is harder", () => {
    const failed = createBaseContext();
    const farther = { ...failed, distance: "across_yard" } as const;
    const nearer = { ...failed, distance: "few_steps" } as const;

    expect(isContextNoHarderThan(farther, failed, increaseTriggerDistanceMetadata)).toBe(true);
    expect(isContextNoHarderThan(farther, failed, decreaseOwnerDistanceMetadata)).toBe(false);
    expect(isContextNoHarderThan(nearer, failed, increaseTriggerDistanceMetadata)).toBe(false);
    expect(isContextNoHarderThan(nearer, failed, decreaseOwnerDistanceMetadata)).toBe(true);
  });
});
