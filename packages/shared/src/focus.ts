import { z } from "zod";

export const focusAddSchema = z.object({
  skillId: z.string().uuid(),
});
export type FocusAddInput = z.infer<typeof focusAddSchema>;

export const focusWeekQuerySchema = z.object({
  weekStart: z.string().datetime(),
  weekEnd: z.string().datetime(),
});
export type FocusWeekQuery = z.infer<typeof focusWeekQuerySchema>;
