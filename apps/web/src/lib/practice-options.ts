import type { MessageKey } from "@/i18n/types";
import type {
  CueSupport,
  EasingStrategy,
  PracticeDimension,
  PracticeDistance,
  PracticeDistraction,
  PracticeDurationBand,
  PracticeEnvironment,
  PracticeOutcome,
  ReferralCategory,
  SafetyRule,
  SafetySignalType,
  SuggestionRule,
} from "@turingcare/shared";

export const OUTCOME_KEYS: Record<PracticeOutcome, MessageKey> = {
  went_well: "practice.outcomeWentWell",
  mixed: "practice.outcomeMixed",
  too_hard: "practice.outcomeTooHard",
};

/** Reviewed, direction-aware clause for every fallback. */
export const EASING_STRATEGY_KEYS: Record<EasingStrategy, MessageKey> = {
  add_cue_help: "practice.easeAddCueHelp",
  use_quieter_environment: "practice.easeQuieterEnvironment",
  increase_trigger_distance: "practice.easeIncreaseTriggerDistance",
  decrease_owner_distance: "practice.easeDecreaseOwnerDistance",
  shorten_duration: "practice.easeShortenDuration",
  reduce_distractions: "practice.easeReduceDistractions",
};

type DimensionField = {
  cue_support: "cueSupport";
  environment: "environment";
  distance: "distance";
  duration: "durationBand";
  distraction: "distraction";
};

type DimensionValue = {
  cue_support: CueSupport;
  environment: PracticeEnvironment;
  distance: PracticeDistance;
  duration: PracticeDurationBand;
  distraction: PracticeDistraction;
};

type OptionGroup<D extends PracticeDimension> = {
  /** The field name on PracticeEvidenceInput this group writes to. */
  field: DimensionField[D];
  labelKey: MessageKey;
  options: { value: DimensionValue[D]; labelKey: MessageKey }[];
};

export const DIMENSION_CONFIG = {
  cue_support: {
    field: "cueSupport",
    labelKey: "practice.cueSupportLabel",
    options: [
      { value: "food_lure" satisfies CueSupport, labelKey: "practice.cueFoodLure" },
      { value: "hand_signal" satisfies CueSupport, labelKey: "practice.cueHandSignal" },
      { value: "verbal_cue" satisfies CueSupport, labelKey: "practice.cueVerbalCue" },
      { value: "no_extra_help" satisfies CueSupport, labelKey: "practice.cueNoExtraHelp" },
    ],
  },
  environment: {
    field: "environment",
    labelKey: "practice.environmentLabel",
    options: [
      { value: "home_quiet" satisfies PracticeEnvironment, labelKey: "practice.envHomeQuiet" },
      { value: "home_busy" satisfies PracticeEnvironment, labelKey: "practice.envHomeBusy" },
      { value: "yard" satisfies PracticeEnvironment, labelKey: "practice.envYard" },
      {
        value: "quiet_outdoor" satisfies PracticeEnvironment,
        labelKey: "practice.envQuietOutdoor",
      },
      { value: "busy_outdoor" satisfies PracticeEnvironment, labelKey: "practice.envBusyOutdoor" },
    ],
  },
  distance: {
    field: "distance",
    labelKey: "practice.distanceLabel",
    options: [
      { value: "at_side" satisfies PracticeDistance, labelKey: "practice.distAtSide" },
      { value: "few_steps" satisfies PracticeDistance, labelKey: "practice.distFewSteps" },
      { value: "across_room" satisfies PracticeDistance, labelKey: "practice.distAcrossRoom" },
      { value: "across_yard" satisfies PracticeDistance, labelKey: "practice.distAcrossYard" },
      { value: "far_away" satisfies PracticeDistance, labelKey: "practice.distFarAway" },
    ],
  },
  duration: {
    field: "durationBand",
    labelKey: "practice.durationLabel",
    options: [
      { value: "under_5_seconds" satisfies PracticeDurationBand, labelKey: "practice.durUnder5" },
      {
        value: "about_15_seconds" satisfies PracticeDurationBand,
        labelKey: "practice.durAbout15",
      },
      {
        value: "about_30_seconds" satisfies PracticeDurationBand,
        labelKey: "practice.durAbout30",
      },
      {
        value: "one_to_two_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durOneToTwo",
      },
      {
        value: "five_to_fifteen_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durFiveToFifteen",
      },
      {
        value: "about_30_minutes" satisfies PracticeDurationBand,
        labelKey: "practice.durAboutThirtyMinutes",
      },
      {
        value: "one_to_two_hours" satisfies PracticeDurationBand,
        labelKey: "practice.durOneToTwoHours",
      },
      {
        value: "half_day_or_more" satisfies PracticeDurationBand,
        labelKey: "practice.durHalfDayPlus",
      },
    ],
  },
  distraction: {
    field: "distraction",
    labelKey: "practice.distractionLabel",
    options: [
      { value: "none" satisfies PracticeDistraction, labelKey: "practice.distractionNone" },
      { value: "mild" satisfies PracticeDistraction, labelKey: "practice.distractionMild" },
      {
        value: "moderate" satisfies PracticeDistraction,
        labelKey: "practice.distractionModerate",
      },
      { value: "strong" satisfies PracticeDistraction, labelKey: "practice.distractionStrong" },
    ],
  },
} satisfies { [D in PracticeDimension]: OptionGroup<D> };

export const SAFETY_SIGNAL_KEYS: Record<SafetySignalType, MessageKey> = {
  aggression_or_bite_risk: "practice.safetyAggression",
  injury_or_pain: "practice.safetyInjury",
  severe_fear_or_panic: "practice.safetyFear",
};

/** Server rule identifiers map to localized explanations here, not on the API. */
export const RULE_REASON_KEYS: Record<SuggestionRule, MessageKey> = {
  needs_focus_skill: "suggestion.needsFocusBody",
  custom_skill_unsupported: "suggestion.customBody",
  cold_start_curriculum_level: "suggestion.reasonColdStart",
  step_back_after_too_hard: "suggestion.reasonStepBack",
  ease_after_harder_checkin: "suggestion.reasonEase",
  ease_after_hard_context: "suggestion.reasonContext",
  hold_after_mixed: "suggestion.reasonHold",
  maintain_current_level: "suggestion.reasonMaintain",
};

export const SAFETY_BODY_KEYS: Record<SafetyRule, MessageKey> = {
  reported_injury_or_pain: "safety.bodyInjury",
  reported_aggression_or_bite_risk: "safety.bodyAggression",
  reported_severe_fear: "safety.bodyFear",
  severe_recorded_concern: "safety.bodySevereConcern",
  sustained_worsening_intensity: "safety.bodyWorsening",
};

export const REFERRAL_KEYS: Record<ReferralCategory, MessageKey> = {
  veterinarian: "safety.referralVeterinarian",
  veterinary_behaviorist: "safety.referralBehaviorist",
  credentialed_trainer: "safety.referralTrainer",
};

export const REFERRAL_DIRECTORIES: {
  href: string;
  labelKey: MessageKey;
  referrals: ReferralCategory[];
}[] = [
  {
    href: "https://www.dacvb.org/search/custom.asp?id=4709",
    labelKey: "safety.directoryDacvb",
    referrals: ["veterinary_behaviorist"],
  },
  {
    href: "https://www.ccpdt.org/dog-owners/certified-dog-trainer-directory/",
    labelKey: "safety.directoryCcpdt",
    referrals: ["credentialed_trainer"],
  },
  {
    href: "https://iaabc.org/consultants",
    labelKey: "safety.directoryIaabc",
    referrals: ["credentialed_trainer"],
  },
  {
    href: "https://directory.fearfree.com/",
    labelKey: "safety.directoryFearFree",
    referrals: ["credentialed_trainer"],
  },
];
