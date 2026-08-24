import { z } from "zod";
import { VALIDATION_MESSAGE_CODES } from "./validation";

export const registerSchema = z.object({
  name: z.string().min(1, VALIDATION_MESSAGE_CODES.nameRequired).max(100),
  email: z.string().email(VALIDATION_MESSAGE_CODES.emailInvalid),
  password: z.string().min(8, VALIDATION_MESSAGE_CODES.passwordTooShort),
});

export const loginSchema = z.object({
  email: z.string().email(VALIDATION_MESSAGE_CODES.emailInvalid),
  password: z.string().min(1, VALIDATION_MESSAGE_CODES.passwordRequired),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
