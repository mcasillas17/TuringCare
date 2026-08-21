import type {
  CueSupport,
  EasingStrategy,
  ExactPracticeContext,
  PracticeDimension,
  PracticeDistance,
  PracticeDistraction,
  PracticeDurationBand,
  PracticeEnvironment,
} from "@turingcare/shared";

export type AdjacentContext = {
  context: ExactPracticeContext;
  changedDimension: PracticeDimension;
};

type ContextValueByField = {
  cueSupport: CueSupport;
  environment: PracticeEnvironment;
  distance: PracticeDistance;
  durationBand: PracticeDurationBand;
  distraction: PracticeDistraction;
};

type NullableContextByField = {
  [Field in keyof ContextValueByField]: ContextValueByField[Field] | null;
};

const cueSupportOrder = [
  "food_lure",
  "hand_signal",
  "verbal_cue",
  "no_extra_help",
] as const satisfies readonly CueSupport[];

const environmentOrder = [
  "home_quiet",
  "home_busy",
  "yard",
  "quiet_outdoor",
  "busy_outdoor",
] as const satisfies readonly PracticeEnvironment[];

const durationOrder = [
  "under_5_seconds",
  "about_15_seconds",
  "about_30_seconds",
  "one_to_two_minutes",
  "five_to_fifteen_minutes",
  "about_30_minutes",
  "one_to_two_hours",
  "half_day_or_more",
] as const satisfies readonly PracticeDurationBand[];

const distanceOrder = [
  "at_side",
  "few_steps",
  "across_room",
  "across_yard",
  "far_away",
] as const satisfies readonly PracticeDistance[];

const distractionOrder = [
  "none",
  "mild",
  "moderate",
  "strong",
] as const satisfies readonly PracticeDistraction[];

const fieldByDimension = {
  cue_support: "cueSupport",
  environment: "environment",
  distance: "distance",
  duration: "durationBand",
  distraction: "distraction",
} as const satisfies Record<PracticeDimension, keyof ContextValueByField>;

const dimensionByField = {
  cueSupport: "cue_support",
  environment: "environment",
  distance: "distance",
  durationBand: "duration",
  distraction: "distraction",
} as const satisfies Record<keyof ContextValueByField, PracticeDimension>;

const reviewedStrategyByDimension = {
  cue_support: "add_cue_help",
  environment: "use_quieter_environment",
  duration: "shorten_duration",
  distraction: "reduce_distractions",
} as const satisfies Record<Exclude<PracticeDimension, "distance">, EasingStrategy>;

function moveContextValue<Field extends keyof ContextValueByField>(
  source: NullableContextByField,
  field: Field,
  order: readonly ContextValueByField[Field][],
  delta: number,
): AdjacentContext | null {
  const current = source[field];
  if (current === null) return null;

  const currentIndex = order.indexOf(current);
  if (currentIndex < 0) return null;

  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= order.length) return null;

  const context = {
    ...source,
    [field]: order[nextIndex],
  } satisfies ExactPracticeContext;

  return {
    context,
    changedDimension: dimensionByField[field],
  };
}

function moveDistanceContext(
  source: NullableContextByField,
  direction: "easier" | "harder",
  strategy: EasingStrategy,
): AdjacentContext | null {
  if (strategy !== "increase_trigger_distance" && strategy !== "decrease_owner_distance") {
    return null;
  }

  const delta =
    strategy === "increase_trigger_distance"
      ? direction === "easier"
        ? 1
        : -1
      : direction === "easier"
        ? -1
        : 1;

  return moveContextValue(source, "distance", distanceOrder, delta);
}

export function adjacentContext(
  source: ExactPracticeContext,
  dimension: PracticeDimension,
  direction: "easier" | "harder",
  strategy: EasingStrategy,
): AdjacentContext | null {
  switch (dimension) {
    case "cue_support":
      if (strategy !== reviewedStrategyByDimension.cue_support) return null;
      return moveContextValue(
        source,
        fieldByDimension.cue_support,
        cueSupportOrder,
        direction === "easier" ? -1 : 1,
      );
    case "environment":
      if (strategy !== reviewedStrategyByDimension.environment) return null;
      return moveContextValue(
        source,
        fieldByDimension.environment,
        environmentOrder,
        direction === "easier" ? -1 : 1,
      );
    case "distance":
      return moveDistanceContext(source, direction, strategy);
    case "duration":
      if (strategy !== reviewedStrategyByDimension.duration) return null;
      return moveContextValue(
        source,
        fieldByDimension.duration,
        durationOrder,
        direction === "easier" ? -1 : 1,
      );
    case "distraction":
      if (strategy !== reviewedStrategyByDimension.distraction) return null;
      return moveContextValue(
        source,
        fieldByDimension.distraction,
        distractionOrder,
        direction === "easier" ? -1 : 1,
      );
  }
}
