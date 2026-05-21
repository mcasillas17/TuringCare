import { z } from "zod";

export const journalEntrySchema = z.object({
  occurredAt: z.string().min(1, "Date is required"),
  antecedent: z.string().min(1, "Antecedent is required"),
  behavior: z.string().min(1, "Behavior is required"),
  consequence: z.string().min(1, "Consequence is required"),
  intensity: z.number().int().min(1).max(5),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  recoverySeconds: z.number().int().nonnegative().nullable().optional(),
  peoplePresent: z.string().nullable().optional(),
  ownerResponse: z.string().nullable().optional(),
});
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
