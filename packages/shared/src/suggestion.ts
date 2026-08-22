import { z } from "zod";
import { weekKeySchema } from "./focus";
import type { EasingStrategy, PracticeDimension, PracticeOutcome } from "./practice-evidence";

export const suggestionTypeValues = [
  "exercise",
  "safety_suppressed",
  "needs_focus_skill",
  "custom_skill_unsupported",
] as const;
export type SuggestionType = (typeof suggestionTypeValues)[number];

/** Deterministic rule identifiers. Stored on every audit row. */
export const suggestionRuleValues = [
  "needs_focus_skill",
  "custom_skill_unsupported",
  "cold_start_curriculum_level",
  "step_back_after_too_hard",
  "ease_after_harder_checkin",
  "ease_after_hard_context",
  "hold_after_mixed",
  "maintain_current_level",
] as const;
export type SuggestionRule = (typeof suggestionRuleValues)[number];

export const evidenceCategoryValues = [
  "curriculum_only",
  "recent_practice",
  "recent_observation",
] as const;
export type EvidenceCategory = (typeof evidenceCategoryValues)[number];

export const safetyRuleValues = [
  "reported_injury_or_pain",
  "reported_aggression_or_bite_risk",
  "reported_severe_fear",
  "severe_recorded_concern",
  "sustained_worsening_intensity",
] as const;
export type SafetyRule = (typeof safetyRuleValues)[number];

export const referralCategoryValues = [
  "veterinarian",
  "veterinary_behaviorist",
  "credentialed_trainer",
] as const;
export type ReferralCategory = (typeof referralCategoryValues)[number];

export const suggestionSafetySchema = z.object({
  suppressed: z.literal(true),
  ruleId: z.enum(safetyRuleValues),
  referral: z.enum(referralCategoryValues),
});

/** Owner-initiated actions on a shown suggestion. */
export const suggestionActionValues = [
  "started",
  "skipped",
  "rated_useful",
  "rated_not_useful",
] as const;
export type SuggestionAction = (typeof suggestionActionValues)[number];

/** `withdrawn` is system-set when evidence stops supporting an open proposal. */
export const advancementStatusValues = [
  "proposed",
  "confirmed",
  "stayed",
  "rejected",
  "regressed",
  "insufficient_evidence",
  "withdrawn",
] as const;
export type AdvancementStatus = (typeof advancementStatusValues)[number];

export const advancementDecisionValues = [
  "confirmed",
  "stayed",
  "rejected",
  "regressed",
  "insufficient_evidence",
] as const;
export type AdvancementDecision = (typeof advancementDecisionValues)[number];

export const advancementRuleId = "recent_success_at_level" as const;

export const suggestionQuerySchema = z.object({
  weekKey: weekKeySchema,
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

export const suggestionActionSchema = z.object({ action: z.enum(suggestionActionValues) });
export type SuggestionActionInput = z.infer<typeof suggestionActionSchema>;

export const advancementDecisionSchema = z.object({
  decision: z.enum(advancementDecisionValues),
});
export type AdvancementDecisionInput = z.infer<typeof advancementDecisionSchema>;

/** One reviewed exercise: authored catalog prose for a curriculum level. */
export type CurriculumExercise = {
  level: number;
  exercise: string;
  dimension: PracticeDimension;
};

/**
 * The single easier variant. Its explicit strategy is rendered for every
 * level so a distance fallback never reverses safety direction.
 */
export type CurriculumFallback = {
  level: number;
  exercise: string;
  reducedDimension: PracticeDimension;
  sameLevelEasing: boolean;
  easingStrategy: EasingStrategy | null;
};

export type SuggestionEvidence = {
  windowDays: number;
  sessionCount: number;
  wentWellCount: number;
  mixedCount: number;
  tooHardCount: number;
  distinctDayCount: number;
  lastPracticeAt: string | null;
};

export type AdvancementProposalDto = {
  id: string;
  skillId: string;
  fromLevel: number;
  toLevel: number;
  ruleId: typeof advancementRuleId;
  status: AdvancementStatus;
  sessionCount: number;
  dayCount: number;
  windowDays: number;
  supportingSessions: Array<{
    id: string;
    occurredAt: string;
    practiceDay: string;
    outcome: PracticeOutcome;
  }>;
  createdAt: string;
  decidedAt: string | null;
};

export type SuggestionSafety = z.infer<typeof suggestionSafetySchema>;

export type TrainingSuggestion = {
  suggestionId: string | null;
  /** True after the owner skips this exact audited suggestion for the day. */
  dismissed: boolean;
  type: SuggestionType;
  ruleId: SuggestionRule | null;
  curriculumVersion: string;
  dogId: string;
  weekKey: string;
  skill: {
    id: string;
    name: string;
    catalogSkillKey: string | null;
    level: number;
    goalId: string;
    goalName: string;
  } | null;
  primary: CurriculumExercise | null;
  fallback: CurriculumFallback | null;
  requestedDimensions: PracticeDimension[];
  evidenceCategory: EvidenceCategory | null;
  evidence: SuggestionEvidence;
  safety: SuggestionSafety | null;
  advancementProposal: AdvancementProposalDto | null;
};
