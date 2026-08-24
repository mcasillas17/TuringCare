import { z } from "zod";
import { VALIDATION_MESSAGE_CODES } from "./validation";

export const profileUpdateSchema = z.object({
  name: z.string().min(1, VALIDATION_MESSAGE_CODES.nameRequired).max(100),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const profileLocaleUpdateSchema = z
  .object({
    locale: z.enum(["en", "es"]),
  })
  .strict();
export type ProfileLocaleUpdateInput = z.infer<typeof profileLocaleUpdateSchema>;
