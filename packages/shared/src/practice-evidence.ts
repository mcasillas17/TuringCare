import { z } from "zod";

export const practiceOutcomeValues = ["went_well", "mixed", "too_hard"] as const;
export type PracticeOutcome = (typeof practiceOutcomeValues)[number];

export const practiceDimensionValues = [
  "cue_support",
  "environment",
  "distance",
  "duration",
  "distraction",
] as const;
export type PracticeDimension = (typeof practiceDimensionValues)[number];

export const cueSupportValues = [
  "food_lure",
  "hand_signal",
  "verbal_cue",
  "no_extra_help",
] as const;
export type CueSupport = (typeof cueSupportValues)[number];

export const environmentValues = [
  "home_quiet",
  "home_busy",
  "yard",
  "quiet_outdoor",
  "busy_outdoor",
] as const;
export type PracticeEnvironment = (typeof environmentValues)[number];

export const distanceValues = [
  "at_side",
  "few_steps",
  "across_room",
  "across_yard",
  "far_away",
] as const;
export type PracticeDistance = (typeof distanceValues)[number];

export const durationBandValues = [
  "under_5_seconds",
  "about_15_seconds",
  "about_30_seconds",
  "one_to_two_minutes",
  "five_to_fifteen_minutes",
  "about_30_minutes",
  "one_to_two_hours",
  "half_day_or_more",
] as const;
export type PracticeDurationBand = (typeof durationBandValues)[number];

export const distractionValues = ["none", "mild", "moderate", "strong"] as const;
export type PracticeDistraction = (typeof distractionValues)[number];

export const safetySignalValues = [
  "aggression_or_bite_risk",
  "injury_or_pain",
  "severe_fear_or_panic",
] as const;
export type SafetySignalType = (typeof safetySignalValues)[number];

export const practicedTargetVariantValues = ["primary", "fallback"] as const;
export type PracticedTargetVariant = (typeof practicedTargetVariantValues)[number];

export const easingStrategyValues = [
  "add_cue_help",
  "use_quieter_environment",
  "increase_trigger_distance",
  "decrease_owner_distance",
  "shorten_duration",
  "reduce_distractions",
] as const;
export type EasingStrategy = (typeof easingStrategyValues)[number];

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).nullable().optional();

export const practiceEvidenceFields = {
  outcome: optionalEnum(practiceOutcomeValues),
  cueSupport: optionalEnum(cueSupportValues),
  environment: optionalEnum(environmentValues),
  distance: optionalEnum(distanceValues),
  durationBand: optionalEnum(durationBandValues),
  distraction: optionalEnum(distractionValues),
  safetySignal: optionalEnum(safetySignalValues),
  confirmCurrentLevel: z.literal(true).optional(),
  practicedTarget: z
    .object({
      suggestionId: z.string().uuid(),
      variant: z.enum(practicedTargetVariantValues),
    })
    .nullable()
    .optional(),
};

export type PracticeEvidenceAnchorInput = {
  outcome?: PracticeOutcome | null;
  cueSupport?: CueSupport | null;
  environment?: PracticeEnvironment | null;
  distance?: PracticeDistance | null;
  durationBand?: PracticeDurationBand | null;
  distraction?: PracticeDistraction | null;
  confirmCurrentLevel?: true;
  practicedTarget?: {
    suggestionId: string;
    variant: PracticedTargetVariant;
  } | null;
};

export function isValidPracticeEvidenceAnchor(input: PracticeEvidenceAnchorInput): boolean {
  if (!input.confirmCurrentLevel) return true;
  if (input.practicedTarget) return false;
  return Boolean(
    input.outcome ??
      input.cueSupport ??
      input.environment ??
      input.distance ??
      input.durationBand ??
      input.distraction,
  );
}

export const practiceEvidenceSchema = z
  .object(practiceEvidenceFields)
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );
export type PracticeEvidenceInput = z.infer<typeof practiceEvidenceSchema>;
