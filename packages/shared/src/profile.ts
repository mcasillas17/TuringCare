import { z } from "zod";

export const profileUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const profileLocaleUpdateSchema = z.object({
  locale: z.enum(["en", "es"]),
});
export type ProfileLocaleUpdateInput = z.infer<typeof profileLocaleUpdateSchema>;
