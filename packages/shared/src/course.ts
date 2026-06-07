import { z } from "zod";

export const courseFormats = ["group", "workshop", "seminar", "private", "drop_in"] as const;
export const courseAgeGroups = ["puppy", "adolescent", "adult", "any"] as const;

export const courseInputSchema = z.object({
  organizationName: z.string().min(1, "Organization is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  format: z.enum(courseFormats),
  ageGroup: z.enum(courseAgeGroups),
  ageRange: z.string().nullable().optional(),
  durationWeeks: z.number().int().positive().nullable().optional(),
  sessionMinutes: z.number().int().positive().nullable().optional(),
  prerequisites: z.string().nullable().optional(),
  skillsTaught: z.array(z.string().min(1)).default([]),
  isOnline: z.boolean().default(false),
  coursePageUrl: z.string().nullable().optional(),
});
export type CourseInput = z.infer<typeof courseInputSchema>;
