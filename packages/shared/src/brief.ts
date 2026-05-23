import { z } from "zod";

export const briefSendSchema = z.object({
  recipient: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().max(500, "Note is too long").nullable().optional(),
});
export type BriefSendInput = z.infer<typeof briefSendSchema>;
