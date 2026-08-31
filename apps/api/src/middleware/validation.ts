import { zValidator } from "@hono/zod-validator";
import { normalizeValidationMessageCode } from "@turingcare/shared";
import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";

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

export const stableZValidator = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c): Response | undefined => {
    if (result.success) return;

    return c.json(
      {
        success: false,
        error: {
          issues: result.error.issues.map((issue) => ({
            ...issue,
            message: normalizeValidationMessageCode(issue.message),
          })),
        },
      },
      400,
    );
  });
