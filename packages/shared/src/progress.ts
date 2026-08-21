import { z } from "zod";
import { isValidPracticeEvidenceAnchor, practiceEvidenceFields } from "./practice-evidence";

export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 5;

export const trainingSkillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(120),
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type TrainingSkillInput = z.infer<typeof trainingSkillSchema>;

export const skillLevelSchema = z.object({
  level: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type SkillLevelInput = z.infer<typeof skillLevelSchema>;

const practiceSessionFields = {
  occurredAt: z.string().min(1, "Date is required"),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  ...practiceEvidenceFields,
};

const offsetOccurredAtSchema = z.string().datetime({ offset: true });
const legacyOccurredAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date must be a local datetime");

export const practiceSessionSchema = z
  .object(practiceSessionFields)
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;

export const practiceSessionApiSchema = z
  .object({
    ...practiceSessionFields,
    occurredAt: z.union([offsetOccurredAtSchema, legacyOccurredAtSchema]),
  })
  .refine(
    isValidPracticeEvidenceAnchor,
    "Current-level confirmation requires structured evidence and no suggestion target",
  );
