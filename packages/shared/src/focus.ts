import { z } from "zod";

/**
 * Local Monday of the focus week, as `YYYY-MM-DD`. Weekly focus is versioned by
 * this key so a past week always renders the selection that was active then.
 * The client sends its own local Monday; the server never derives it from an
 * instant, so owners in any timezone get a stable, consistent week bucket.
 */
export const weekKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekKey must be YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "weekKey must be a real date")
  .refine(
    (value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1,
    "weekKey must be a Monday",
  );
export type WeekKey = z.infer<typeof weekKeySchema>;

export const focusAddSchema = z.object({
  skillId: z.string().uuid(),
  weekKey: weekKeySchema,
});
export type FocusAddInput = z.infer<typeof focusAddSchema>;

export const focusWeekQuerySchema = z.object({
  weekKey: weekKeySchema,
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  weekEndTimezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});
export type FocusWeekQuery = z.infer<typeof focusWeekQuerySchema>;

export const focusRemoveQuerySchema = z.object({ weekKey: weekKeySchema });
export type FocusRemoveQuery = z.infer<typeof focusRemoveQuerySchema>;
