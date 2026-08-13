import { describe, expect, it } from "vitest";
import {
  DIMENSION_CONFIG,
  EASING_STRATEGY_KEYS,
  OUTCOME_KEYS,
  REFERRAL_DIRECTORIES,
  REFERRAL_KEYS,
  RULE_REASON_KEYS,
  SAFETY_BODY_KEYS,
  SAFETY_SIGNAL_KEYS,
} from "./practice-options";

describe("practice option maps", () => {
  it("maps every launch contract value to the intended localization key", () => {
    expect(OUTCOME_KEYS).toEqual({
      went_well: "practice.outcomeWentWell",
      mixed: "practice.outcomeMixed",
      too_hard: "practice.outcomeTooHard",
    });
    expect(EASING_STRATEGY_KEYS).toEqual({
      add_cue_help: "practice.easeAddCueHelp",
      use_quieter_environment: "practice.easeQuieterEnvironment",
      increase_trigger_distance: "practice.easeIncreaseTriggerDistance",
      decrease_owner_distance: "practice.easeDecreaseOwnerDistance",
      shorten_duration: "practice.easeShortenDuration",
      reduce_distractions: "practice.easeReduceDistractions",
    });
    expect(SAFETY_SIGNAL_KEYS).toEqual({
      aggression_or_bite_risk: "practice.safetyAggression",
      injury_or_pain: "practice.safetyInjury",
      severe_fear_or_panic: "practice.safetyFear",
    });
    expect(RULE_REASON_KEYS).toEqual({
      needs_focus_skill: "suggestion.needsFocusBody",
      custom_skill_unsupported: "suggestion.customBody",
      cold_start_curriculum_level: "suggestion.reasonColdStart",
      step_back_after_too_hard: "suggestion.reasonStepBack",
      ease_after_harder_checkin: "suggestion.reasonEase",
      ease_after_hard_context: "suggestion.reasonContext",
      hold_after_mixed: "suggestion.reasonHold",
      maintain_current_level: "suggestion.reasonMaintain",
    });
    expect(SAFETY_BODY_KEYS).toEqual({
      reported_injury_or_pain: "safety.bodyInjury",
      reported_aggression_or_bite_risk: "safety.bodyAggression",
      reported_severe_fear: "safety.bodyFear",
      severe_recorded_concern: "safety.bodySevereConcern",
      sustained_worsening_intensity: "safety.bodyWorsening",
    });
    expect(REFERRAL_KEYS).toEqual({
      veterinarian: "safety.referralVeterinarian",
      veterinary_behaviorist: "safety.referralBehaviorist",
      credentialed_trainer: "safety.referralTrainer",
    });
  });

  it("pairs each dimension field with its exact API values", () => {
    expect(
      Object.fromEntries(
        Object.entries(DIMENSION_CONFIG).map(([dimension, config]) => [
          dimension,
          { field: config.field, values: config.options.map(({ value }) => value) },
        ]),
      ),
    ).toEqual({
      cue_support: {
        field: "cueSupport",
        values: ["food_lure", "hand_signal", "verbal_cue", "no_extra_help"],
      },
      environment: {
        field: "environment",
        values: ["home_quiet", "home_busy", "yard", "quiet_outdoor", "busy_outdoor"],
      },
      distance: {
        field: "distance",
        values: ["at_side", "few_steps", "across_room", "across_yard", "far_away"],
      },
      duration: {
        field: "durationBand",
        values: [
          "under_5_seconds",
          "about_15_seconds",
          "about_30_seconds",
          "one_to_two_minutes",
          "five_to_fifteen_minutes",
          "about_30_minutes",
          "one_to_two_hours",
          "half_day_or_more",
        ],
      },
      distraction: {
        field: "distraction",
        values: ["none", "mild", "moderate", "strong"],
      },
    });
  });

  it("uses the verified professional-directory destinations", () => {
    expect(REFERRAL_DIRECTORIES).toEqual([
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
    ]);
  });
});
