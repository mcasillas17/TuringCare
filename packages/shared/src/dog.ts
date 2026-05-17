import { z } from "zod";

export const dogSize = z.enum(["small", "medium", "large", "giant"]);
export const dogSex = z.enum(["male", "female"]);
export const dogSource = z.enum(["breeder", "rescue", "shelter", "other"]);
export const vaccineStage = z.enum(["in_progress", "complete", "unknown"]);

export const dogProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  breed: z.string().min(1).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  size: dogSize,
  weightLbs: z.number().positive().nullable().optional(),
  sex: dogSex,
  spayedNeutered: z.boolean().default(false),
  source: dogSource,
  adoptedAt: z.string().date().nullable().optional(),
  vaccineStage: vaccineStage,
  notes: z.string().nullable().optional(),
});

export type DogProfile = z.infer<typeof dogProfileSchema>;
