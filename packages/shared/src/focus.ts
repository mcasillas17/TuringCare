import { z } from "zod";

/**
 * Local Monday of the focus week, as `YYYY-MM-DD`. Weekly focus is versioned by
 * this key so a past week always renders the selection that was active then.
 * The client sends its own local Monday; the server never derives it from an
 * instant, so owners in any timezone get a stable, consistent week bucket.
 */
export const weekKeySchema = z.iso
  .date("weekKey must be a real YYYY-MM-DD date")
  .refine(
    (value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1,
    "weekKey must be a Monday",
  );

export const focusAddSchema = z.object({
  skillId: z.string().uuid(),
  weekKey: weekKeySchema,
});

export const focusWeekQuerySchema = z.object({
  weekKey: weekKeySchema,
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
  weekEndTimezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840),
});

export const focusRemoveQuerySchema = z.object({ weekKey: weekKeySchema });
