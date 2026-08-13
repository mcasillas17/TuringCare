import type {
  EvidenceCategory,
  PracticeOutcome,
  SuggestionRule,
  SuggestionType,
} from "@turingcare/shared";
import { clampLevel } from "./curriculum";
import type { RecentObservation } from "./observations";

/** How many of the most recent outcomes the rules look at. */
export const RECENT_OUTCOME_WINDOW = 3;
export const STEP_BACK_TOO_HARD_COUNT = 2;
export const HOLD_MIXED_COUNT = 2;

export type RuleInputs = {
  now: Date;
  hasFocusSkill: boolean;
  catalogSkillKey: string | null;
  level: number;
  /** Newest first, filtered to the confirmed or one-step-easier level. */
  recentOutcomes: PracticeOutcome[];
  latestMixedHadChallengingContext: boolean;
  lastWentWellAt: Date | null;
  observation: RecentObservation;
};

export type RuleResult = {
  ruleId: SuggestionRule;
  type: SuggestionType;
  effectiveLevel: number | null;
  evidenceCategory: EvidenceCategory | null;
};

/** Pure, fixed-precedence selection over structured evidence only. */
export function selectSuggestionRule(inputs: RuleInputs): RuleResult {
  if (!inputs.hasFocusSkill) {
    return {
      ruleId: "needs_focus_skill",
      type: "needs_focus_skill",
      effectiveLevel: null,
      evidenceCategory: null,
    };
  }
  if (!inputs.catalogSkillKey) {
    return {
      ruleId: "custom_skill_unsupported",
      type: "custom_skill_unsupported",
      effectiveLevel: null,
      evidenceCategory: null,
    };
  }

  const level = clampLevel(inputs.level);
  const recent = inputs.recentOutcomes.slice(0, RECENT_OUTCOME_WINDOW);
  const countOf = (outcome: PracticeOutcome) => recent.filter((value) => value === outcome).length;

  if (recent.length === 0) {
    return {
      ruleId: "cold_start_curriculum_level",
      type: "exercise",
      effectiveLevel: level,
      evidenceCategory: "curriculum_only",
    };
  }

  if (countOf("too_hard") >= STEP_BACK_TOO_HARD_COUNT) {
    return {
      ruleId: "step_back_after_too_hard",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_practice",
    };
  }

  const harder = inputs.observation?.trend === "harder" ? inputs.observation : null;
  const successSinceCheckin =
    harder && inputs.lastWentWellAt ? inputs.lastWentWellAt >= harder.occurredAt : false;
  if (harder && !successSinceCheckin) {
    return {
      ruleId: "ease_after_harder_checkin",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_observation",
    };
  }

  if (inputs.latestMixedHadChallengingContext) {
    return {
      ruleId: "ease_after_hard_context",
      type: "exercise",
      effectiveLevel: clampLevel(level - 1),
      evidenceCategory: "recent_practice",
    };
  }

  if (countOf("mixed") >= HOLD_MIXED_COUNT) {
    return {
      ruleId: "hold_after_mixed",
      type: "exercise",
      effectiveLevel: level,
      evidenceCategory: "recent_practice",
    };
  }

  return {
    ruleId: "maintain_current_level",
    type: "exercise",
    effectiveLevel: level,
    evidenceCategory: "recent_practice",
  };
}
