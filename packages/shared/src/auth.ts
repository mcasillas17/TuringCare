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

export const verificationResendSchema = z.object({
  email: z.string().trim().email(VALIDATION_MESSAGE_CODES.emailInvalid).max(254).optional(),
  password: z.string().min(1, VALIDATION_MESSAGE_CODES.passwordRequired).max(128).optional(),
  returnTo: z.string().max(2048).optional(),
});

export type VerificationResendInput = z.infer<typeof verificationResendSchema>;

export const VERIFICATION_RESEND_WINDOW_SECONDS = 60;

export const verificationConfirmSchema = z.object({}).strict();
const verificationDestination = {
  next: z
    .string()
    .max(1024)
    .refine((value) => safeAuthReturnPath(value) === value),
  locale: z.enum(["en", "es"]),
};
export const verificationStatusSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...verificationDestination,
      status: z.enum(["none", "pending", "invalid", "expired"]),
      requiresSignOut: z.never().optional(),
    })
    .strict(),
  z
    .object({
      ...verificationDestination,
      status: z.literal("verified"),
      // The proof belongs to another currently authenticated account. No identity
      // is disclosed; the UI must offer sign-out/switch recovery.
      requiresSignOut: z.literal(true).optional(),
    })
    .strict(),
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

/**
 * Auth continuation is a path, never an arbitrary URL. No query/fragment or
 * encoded characters are needed by these routes; rejecting them also excludes
 * redirect nesting, auth loops, and public Brief bearer credentials.
 */
export function safeAuthReturnPath(input: unknown): string {
  if (typeof input !== "string" || input.length > 2048) return "/my";
  if (input === "/") return input;
  if (!/^\/(?:my|admin|trainers|courses)(?:\/[A-Za-z0-9_-]+)*\/?$/.test(input)) return "/my";
  return input;
}
