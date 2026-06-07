import { z } from "zod";

export const briefSendSchema = z.object({
  recipient: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().max(500, "Note is too long").nullable().optional(),
});
export type BriefSendInput = z.infer<typeof briefSendSchema>;

export const briefWindows = ["7d", "30d", "90d", "all"] as const;
export type BriefWindow = (typeof briefWindows)[number];

export const briefGenerateSchema = z.object({
  window: z.enum(briefWindows).default("30d"),
});
export type BriefGenerateInput = z.infer<typeof briefGenerateSchema>;
