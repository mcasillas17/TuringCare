import { z } from "zod";

const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    "Must be an http or https URL",
  );

export const courseFormats = ["group", "workshop", "seminar", "private", "drop_in"] as const;
export const courseAgeGroups = ["puppy", "adolescent", "adult", "any"] as const;

export const courseInputSchema = z.object({
  organizationName: z.string().min(1, "Organization is required").max(200),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  name: z.string().min(1, "Name is required").max(200),
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
