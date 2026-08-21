import { z } from "zod";
import {
  cueSupportValues,
  distanceValues,
  distractionValues,
  durationBandValues,
  environmentValues,
  practiceDimensionValues,
  practiceOutcomeValues,
} from "./practice-evidence";
import { suggestionSafetySchema } from "./suggestion";

export const CONTEXTUAL_PROGRESS_WINDOW_DAYS = 21 as const;

export const contextualStatusValues = ["reliable", "developing", "not_observed"] as const;
export type ContextualStatus = (typeof contextualStatusValues)[number];

export const nextPracticeDirectionValues = ["easier", "harder", "repeat"] as const;
export type NextPracticeDirection = (typeof nextPracticeDirectionValues)[number];

export const contextualProgressSurfaceValues = ["week", "skill_detail"] as const;
export type ContextualProgressSurface = (typeof contextualProgressSurfaceValues)[number];

export const nextPracticeRuleValues = [
  "ease_after_too_hard",
  "advance_reliable_context",
  "repeat_developing_context",
] as const;
export type NextPracticeRuleId = (typeof nextPracticeRuleValues)[number];

export const exactPracticeContextSchema = z.object({
  cueSupport: z.enum(cueSupportValues).nullable(),
  environment: z.enum(environmentValues).nullable(),
  distance: z.enum(distanceValues).nullable(),
  durationBand: z.enum(durationBandValues).nullable(),
  distraction: z.enum(distractionValues).nullable(),
});
export type ExactPracticeContext = z.infer<typeof exactPracticeContextSchema>;

export const exactContextEvidenceSchema = z.object({
  context: exactPracticeContextSchema,
  status: z.enum(contextualStatusValues),
  successfulDistinctDays: z.number().int().nonnegative(),
  latestOutcome: z.enum(practiceOutcomeValues).nullable(),
  lastObservedAt: z.string().datetime().nullable(),
  lastSuccessfulAt: z.string().datetime().nullable(),
});
export type ExactContextEvidence = z.infer<typeof exactContextEvidenceSchema>;

export const nextPracticeActionSchema = z.object({
  ruleId: z.enum(nextPracticeRuleValues),
  direction: z.enum(nextPracticeDirectionValues),
  context: exactPracticeContextSchema,
  changedDimension: z.enum(practiceDimensionValues).nullable(),
});
export type NextPracticeAction = z.infer<typeof nextPracticeActionSchema>;

export const contextualProgressSummarySchema = z.object({
  strongestContext: exactContextEvidenceSchema.nullable(),
  nextPracticeAction: nextPracticeActionSchema.nullable(),
  safety: suggestionSafetySchema.nullable(),
});
export type ContextualProgressSummary = z.infer<typeof contextualProgressSummarySchema>;

export const contextualProgressSchema = contextualProgressSummarySchema.extend({
  window: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    days: z.literal(CONTEXTUAL_PROGRESS_WINDOW_DAYS),
  }),
  curriculumLevel: z.number().int().min(1).max(5),
  curriculumVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  exactContexts: z.array(exactContextEvidenceSchema),
});
export type ContextualProgress = z.infer<typeof contextualProgressSchema>;

export const contextualProgressEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("training.context_insight_viewed"),
    surface: z.enum(contextualProgressSurfaceValues),
    strongestStatus: z.enum(contextualStatusValues).nullable(),
    hasNextAction: z.boolean(),
  }),
  z.object({
    name: z.literal("training.context_next_action_used"),
    surface: z.enum(contextualProgressSurfaceValues),
    ruleId: z.enum(nextPracticeRuleValues),
    direction: z.enum(nextPracticeDirectionValues),
  }),
]);
export type ContextualProgressEvent = z.infer<typeof contextualProgressEventSchema>;
