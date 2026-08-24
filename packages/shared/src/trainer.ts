import { z } from "zod";
import { VALIDATION_MESSAGE_CODES } from "./validation";

const httpUrl = z
  .string()
  .url(VALIDATION_MESSAGE_CODES.httpUrlRequired)
  .refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    VALIDATION_MESSAGE_CODES.httpUrlRequired,
  );

export const trainerInputSchema = z.object({
  name: z.string().min(1, VALIDATION_MESSAGE_CODES.nameRequired).max(200),
  businessName: z.string().min(1).max(200).nullable().optional(),
  city: z.string().min(1, VALIDATION_MESSAGE_CODES.cityRequired).max(100),
  state: z.string().min(1, VALIDATION_MESSAGE_CODES.stateRequired).max(100),
  methodologyTags: z.array(z.string().min(1).max(100)).default([]),
  certifications: z.array(z.string().min(1).max(200)).default([]),
  specialties: z.array(z.string().min(1).max(100)).default([]),
  website: httpUrl.nullable().optional(),
  email: z.string().email(VALIDATION_MESSAGE_CODES.emailInvalid).nullable().optional(),
  phone: z.string().min(1).max(50).nullable().optional(),
  notesInternal: z.string().max(5000).nullable().optional(),
});

export type TrainerInput = z.infer<typeof trainerInputSchema>;
