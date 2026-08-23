import { z } from "zod";
import { VALIDATION_MESSAGE_CODES } from "./validation";

export const briefSendIntentSchema = z.object({
  recipient: z.string().trim().email(VALIDATION_MESSAGE_CODES.emailInvalid),
  message: z.string().trim().max(500, VALIDATION_MESSAGE_CODES.noteTooLong).nullable().optional(),
});
export type BriefSendIntent = z.infer<typeof briefSendIntentSchema>;

export const briefSendSchema = briefSendIntentSchema.extend({
  idempotencyKey: z.string().uuid(VALIDATION_MESSAGE_CODES.invalid),
});
export type BriefSendInput = z.infer<typeof briefSendSchema>;

export const briefWindows = ["7d", "30d", "90d", "all"] as const;
export type BriefWindow = (typeof briefWindows)[number];

export const briefGenerateSchema = z.object({
  window: z.enum(briefWindows).default("30d"),
});
export type BriefGenerateInput = z.infer<typeof briefGenerateSchema>;
