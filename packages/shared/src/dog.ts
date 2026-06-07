import { z } from "zod";

export const dogSize = z.enum(["small", "medium", "large", "giant"]);
export const dogSex = z.enum(["male", "female"]);
export const dogSource = z.enum(["breeder", "rescue", "shelter", "other"]);
export const vaccineStage = z.enum(["in_progress", "complete", "unknown"]);

export const dogProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  breed: z.string().min(1).max(100).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  size: dogSize,
  weightLbs: z.number().positive().nullable().optional(),
  sex: dogSex,
  spayedNeutered: z.boolean().default(false),
  source: dogSource,
  adoptedAt: z.string().date().nullable().optional(),
  vaccineStage: vaccineStage,
  notes: z.string().max(2000).nullable().optional(),
});

export type DogProfile = z.infer<typeof dogProfileSchema>;

export const concernSeverity = z.enum(["mild", "moderate", "severe"]);

export const behaviorConcernSchema = z.object({
  concern: z.string().min(1, "Concern is required").max(500),
  severity: concernSeverity,
});
export type BehaviorConcernInput = z.infer<typeof behaviorConcernSchema>;

export const trainingGoalSchema = z.object({
  goal: z.string().min(1, "Goal is required").max(200),
});
export type TrainingGoalInput = z.infer<typeof trainingGoalSchema>;

export const goalFromTemplateSchema = z.object({
  templateKey: z.string().min(1).max(200),
});
export type GoalFromTemplateInput = z.infer<typeof goalFromTemplateSchema>;
