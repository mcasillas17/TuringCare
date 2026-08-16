import { z } from "zod";
import { behaviorConcernSchema, dogProfileSchema } from "./dog";
import { journalDailyCheckInCreateSchema } from "./journal";

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

export const guidedSetupStartSchema = dogProfileSchema.strict();

export const guidedSetupIntentInputSchema = z
  .object({
    intent: z.enum(guidedSetupIntentValues),
  })
  .strict();

export const guidedSetupBehaviorActionSchema = behaviorConcernSchema
  .extend({
    safetyConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.severity === "severe" || value.safetySignal != null) && !value.safetyConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["safetyConfirmed"],
        message: "Safety confirmation is required",
      });
    }
  });

export const guidedSetupTrainingActionSchema = z
  .object({
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
  .strict();

export type GuidedSetupIntent = (typeof guidedSetupIntentValues)[number];
export type GuidedSetupStep = (typeof guidedSetupStepValues)[number];
export type GuidedSetupCompletionReason =
  (typeof guidedSetupCompletionReasonValues)[number];
export type GuidedSetupActionType = (typeof guidedSetupActionTypeValues)[number];
export type GuidedSetupBehaviorAction = z.infer<typeof guidedSetupBehaviorActionSchema>;
export type GuidedSetupTrainingAction = z.infer<typeof guidedSetupTrainingActionSchema>;
export type GuidedSetupProgressAction = z.infer<typeof guidedSetupProgressActionSchema>;
export type GuidedSetupActionData =
  | GuidedSetupBehaviorAction
  | GuidedSetupTrainingAction
  | GuidedSetupProgressAction;

export type GuidedSetupRecord = {
  id: string;
  userId: string;
  dogId: string | null;
  dogName: string | null;
  currentStep: GuidedSetupStep;
  intent: GuidedSetupIntent | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionReason: GuidedSetupCompletionReason | null;
  actionType: GuidedSetupActionType | null;
  actionData: GuidedSetupActionData | null;
};

export type GuidedSetupStatus = {
  active: GuidedSetupRecord | null;
  latest: GuidedSetupRecord | null;
  autoStartEligible: boolean;
};
