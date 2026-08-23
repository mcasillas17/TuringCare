import { z } from "zod";
import { VALIDATION_MESSAGE_CODES } from "./validation";

const httpUrl = z
  .string()
  .url(VALIDATION_MESSAGE_CODES.httpUrlRequired)
  .refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    VALIDATION_MESSAGE_CODES.httpUrlRequired,
  );

export const courseFormats = ["group", "workshop", "seminar", "private", "drop_in"] as const;
export const courseAgeGroups = ["puppy", "adolescent", "adult", "any"] as const;

export const courseInputSchema = z.object({
  organizationName: z.string().min(1, VALIDATION_MESSAGE_CODES.organizationRequired).max(200),
  city: z.string().min(1, VALIDATION_MESSAGE_CODES.cityRequired).max(100),
  state: z.string().min(1, VALIDATION_MESSAGE_CODES.stateRequired).max(100),
  name: z.string().min(1, VALIDATION_MESSAGE_CODES.nameRequired).max(200),
  description: z.string().max(2000).nullable().optional(),
  format: z.enum(courseFormats),
  ageGroup: z.enum(courseAgeGroups),
  ageRange: z.string().max(100).nullable().optional(),
  durationWeeks: z.number().int().positive().nullable().optional(),
  sessionMinutes: z.number().int().positive().nullable().optional(),
  prerequisites: z.string().max(1000).nullable().optional(),
  skillsTaught: z.array(z.string().min(1).max(200)).default([]),
  isOnline: z.boolean().default(false),
  coursePageUrl: httpUrl.nullable().optional(),
});
export type CourseInput = z.infer<typeof courseInputSchema>;
