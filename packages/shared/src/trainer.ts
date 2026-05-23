import { z } from "zod";

export const trainerInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  businessName: z.string().min(1).nullable().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  methodologyTags: z.array(z.string().min(1)).default([]),
  certifications: z.array(z.string().min(1)).default([]),
  specialties: z.array(z.string().min(1)).default([]),
  website: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  notesInternal: z.string().nullable().optional(),
});

export type TrainerInput = z.infer<typeof trainerInputSchema>;
