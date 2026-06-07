import { z } from "zod";

const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    "Must be an http or https URL",
  );

export const trainerInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  businessName: z.string().min(1).max(200).nullable().optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  methodologyTags: z.array(z.string().min(1).max(100)).default([]),
  certifications: z.array(z.string().min(1).max(200)).default([]),
  specialties: z.array(z.string().min(1).max(100)).default([]),
  website: httpUrl.nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1).max(50).nullable().optional(),
  notesInternal: z.string().max(5000).nullable().optional(),
});

export type TrainerInput = z.infer<typeof trainerInputSchema>;
