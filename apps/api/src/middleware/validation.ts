import { zValidator } from "@hono/zod-validator";
import { normalizeValidationMessageCode } from "@turingcare/shared";
import type { ValidationTargets } from "hono";
import type { ZodSchema, z } from "zod";

export const stableZValidator = <
  T extends ZodSchema<unknown, z.ZodTypeDef, unknown>,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (result.success) return;

    for (const issue of result.error.issues) {
      issue.message = normalizeValidationMessageCode(issue.message);
    }
  });
