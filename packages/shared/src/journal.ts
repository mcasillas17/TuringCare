import { z } from "zod";

export const journalEntryKindValues = ["moment", "daily_checkin"] as const;
export const journalTrendValues = ["better", "same", "harder"] as const;

const noteSchema = z.string().trim().min(1, "Quick note is required").max(1000);
const optionalText = z.string().trim().max(1000).nullable().optional();
const optionalNonNegativeInteger = z.number().int().nonnegative().nullable().optional();
const optionalIntensity = z.number().int().min(1).max(5).nullable().optional();

const journalDetailsSchema = z.object({
  occurredAt: z.string().min(1, "Date is required").optional(),
  antecedent: optionalText,
  behavior: optionalText,
  consequence: optionalText,
  intensity: optionalIntensity,
  location: optionalText,
  notes: optionalText,
  durationSeconds: optionalNonNegativeInteger,
  recoverySeconds: optionalNonNegativeInteger,
  peoplePresent: optionalText,
  ownerResponse: optionalText,
});

export const journalMomentCreateSchema = journalDetailsSchema.extend({
  kind: z.literal("moment"),
  note: noteSchema,
  trend: z.null().optional(),
});

export const journalDailyCheckInCreateSchema = z.object({
  kind: z.literal("daily_checkin"),
  note: noteSchema,
  trend: z.enum(journalTrendValues),
  occurredAt: z.string().min(1, "Date is required").optional(),
});

export const journalEntryCreateSchema = z.discriminatedUnion("kind", [
  journalMomentCreateSchema,
  journalDailyCheckInCreateSchema,
]);

export const journalEntryUpdateSchema = journalDetailsSchema
  .extend({
    kind: z.enum(journalEntryKindValues).optional(),
    note: noteSchema.optional(),
    trend: z.enum(journalTrendValues).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "moment" && value.trend) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trend"],
        message: "Trend is only available for daily check-ins",
      });
    }
  });

export type JournalEntryKind = (typeof journalEntryKindValues)[number];
export type JournalTrend = (typeof journalTrendValues)[number];
export type JournalMomentCreateInput = z.infer<typeof journalMomentCreateSchema>;
export type JournalDailyCheckInCreateInput = z.infer<typeof journalDailyCheckInCreateSchema>;
export type JournalEntryCreateInput = z.infer<typeof journalEntryCreateSchema>;
export type JournalEntryUpdateInput = z.infer<typeof journalEntryUpdateSchema>;

export const journalEntrySchema = journalEntryCreateSchema;
export type JournalEntryInput = JournalEntryCreateInput;
