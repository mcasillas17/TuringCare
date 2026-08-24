import { z } from "zod";
import { behaviorConcernSchema, dogProfileSchema } from "./dog";
import { journalDailyCheckInCreateSchema } from "./journal";
import { VALIDATION_MESSAGE_CODES } from "./validation";

export const guidedSetupIntentValues = [
  "understand_behavior",
  "train_skill",
  "track_progress",
] as const;
export const guidedSetupStepValues = ["intent", "action"] as const;
export const guidedSetupCompletionReasonValues = [
  "first_action_completed",
  "skipped",
  "abandoned",
] as const;
export const guidedSetupActionTypeValues = ["behavior", "training", "progress"] as const;
export const guidedSetupTrainingTemplateKeyValues = [
  "basic-manners",
  "puppy-fundamentals",
  "recall-reliability",
] as const;

export const guidedSetupStartSchema = dogProfileSchema.strict();

export const guidedSetupMutationSchema = z
  .object({
    setupId: z.string().uuid(),
  })
  .strict();

export const guidedSetupIntentInputSchema = z
  .object({
    setupId: z.string().uuid(),
    intent: z.enum(guidedSetupIntentValues),
  })
  .strict();

export const guidedSetupBehaviorActionSchema = behaviorConcernSchema
  .extend({
    setupId: z.string().uuid(),
    safetyConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.severity === "severe" || value.safetySignal != null) && !value.safetyConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["safetyConfirmed"],
        message: VALIDATION_MESSAGE_CODES.safetyConfirmationRequired,
      });
    }
  });

export const guidedSetupTrainingActionSchema = z
  .object({
    setupId: z.string().uuid(),
    templateKey: z.string().min(1).max(200),
    weekKey: z.string().date(),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  })
  .strict();

export const guidedSetupProgressActionSchema = journalDailyCheckInCreateSchema
  .omit({
    kind: true,
    occurredAt: true,
  })
  .extend({
    setupId: z.string().uuid(),
  })
  .strict();

export type GuidedSetupIntent = (typeof guidedSetupIntentValues)[number];
export type GuidedSetupStep = (typeof guidedSetupStepValues)[number];
export type GuidedSetupCompletionReason = (typeof guidedSetupCompletionReasonValues)[number];
export type GuidedSetupActionType = (typeof guidedSetupActionTypeValues)[number];
export type GuidedSetupBehaviorAction = z.infer<typeof guidedSetupBehaviorActionSchema>;
export type GuidedSetupTrainingAction = z.infer<typeof guidedSetupTrainingActionSchema>;
export type GuidedSetupProgressAction = z.infer<typeof guidedSetupProgressActionSchema>;

export type GuidedSetupRecord = {
  id: string;
  dogId: string | null;
  dogName: string | null;
  currentStep: GuidedSetupStep;
  intent: GuidedSetupIntent | null;
  startedAt: string;
  completedAt: string | null;
  completionReason: GuidedSetupCompletionReason | null;
  firstActionType: GuidedSetupActionType | null;
  firstActionId: string | null;
};

export type GuidedSetupStatus = {
  active: GuidedSetupRecord | null;
  latest: GuidedSetupRecord | null;
  autoStartEligible: boolean;
};
