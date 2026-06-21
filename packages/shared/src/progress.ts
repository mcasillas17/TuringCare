import { z } from "zod";

export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 5;

export const trainingSkillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(120),
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type TrainingSkillInput = z.infer<typeof trainingSkillSchema>;

export const skillConfidenceSchema = z.object({
  confidence: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type SkillConfidenceInput = z.infer<typeof skillConfidenceSchema>;

export const skillLevelSchema = z.object({
  level: z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX),
});
export type SkillLevelInput = z.infer<typeof skillLevelSchema>;

export const practiceSessionSchema = z.object({
  occurredAt: z.string().min(1, "Date is required"),
  durationMinutes: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;
