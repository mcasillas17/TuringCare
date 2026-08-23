import { zValidator } from "@hono/zod-validator";
import { normalizeValidationMessageCode } from "@turingcare/shared";
import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodSchema, z } from "zod";

const MALFORMED_JSON_HTTP_MESSAGE = "Malformed JSON in request body";

export function isMalformedJsonValidationError(error: unknown): boolean {
  return (
    error instanceof HTTPException &&
    error.status === 400 &&
    error.message === MALFORMED_JSON_HTTP_MESSAGE
  );
}

export function invalidValidationResult() {
  return {
    success: false,
    error: {
      issues: [{ code: "custom", path: [], message: "validation.invalid" }],
    },
  } as const;
}

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
