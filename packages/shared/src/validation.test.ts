import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import { loginSchema, registerSchema } from "./auth";
import { briefSendSchema } from "./brief";
import { courseInputSchema } from "./course";
import { behaviorConcernSchema, dogProfileSchema, trainingGoalSchema } from "./dog";
import { journalEntryUpdateSchema, journalMomentCreateSchema } from "./journal";
import { profileUpdateSchema } from "./profile";
import { practiceSessionSchema, trainingSkillSchema } from "./progress";
import { trainerInputSchema } from "./trainer";
import { isValidationMessageCode, normalizeValidationMessageCode } from "./validation";

function issueMessage(schema: ZodTypeAny, input: unknown, path: string) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error(`expected validation to fail at ${path}`);
  return result.error.issues.find((issue) => issue.path[0] === path)?.message;
}

describe("shared validation message contract", () => {
  it("allowlists only known validation message codes", () => {
    expect(isValidationMessageCode("validation.emailInvalid")).toBe(true);
    expect(isValidationMessageCode("validation.notARealCode")).toBe(false);
    expect(isValidationMessageCode(null)).toBe(false);
  });

  it("preserves known codes and maps uncoded Zod prose to the stable generic code", () => {
    expect(normalizeValidationMessageCode("validation.emailInvalid")).toBe(
      "validation.emailInvalid",
    );
    expect(normalizeValidationMessageCode("Invalid uuid")).toBe("validation.invalid");
    expect(normalizeValidationMessageCode(undefined)).toBe("validation.invalid");
  });

  it.each([
    [
      registerSchema,
      { name: "", email: "valid@example.com", password: "password" },
      "name",
      "validation.nameRequired",
    ],
    [
      registerSchema,
      { name: "Mae", email: "bad", password: "password" },
      "email",
      "validation.emailInvalid",
    ],
    [
      registerSchema,
      { name: "Mae", email: "valid@example.com", password: "short" },
      "password",
      "validation.passwordTooShort",
    ],
    [
      loginSchema,
      { email: "valid@example.com", password: "" },
      "password",
      "validation.passwordRequired",
    ],
    [briefSendSchema, { recipient: "bad" }, "recipient", "validation.emailInvalid"],
    [
      briefSendSchema,
      { recipient: "valid@example.com", message: "x".repeat(501) },
      "message",
      "validation.noteTooLong",
    ],
    [
      courseInputSchema,
      {
        organizationName: "",
        city: "x",
        state: "x",
        name: "x",
        format: "group",
        ageGroup: "adult",
      },
      "organizationName",
      "validation.organizationRequired",
    ],
    [
      courseInputSchema,
      {
        organizationName: "x",
        city: "",
        state: "x",
        name: "x",
        format: "group",
        ageGroup: "adult",
      },
      "city",
      "validation.cityRequired",
    ],
    [
      courseInputSchema,
      {
        organizationName: "x",
        city: "x",
        state: "",
        name: "x",
        format: "group",
        ageGroup: "adult",
      },
      "state",
      "validation.stateRequired",
    ],
    [
      courseInputSchema,
      {
        organizationName: "x",
        city: "x",
        state: "x",
        name: "",
        format: "group",
        ageGroup: "adult",
      },
      "name",
      "validation.nameRequired",
    ],
    [
      courseInputSchema,
      {
        organizationName: "x",
        city: "x",
        state: "x",
        name: "x",
        format: "group",
        ageGroup: "adult",
        coursePageUrl: "ftp://example.com",
      },
      "coursePageUrl",
      "validation.httpUrlRequired",
    ],
    [
      dogProfileSchema,
      { name: "", size: "medium", sex: "female", source: "rescue", vaccineStage: "unknown" },
      "name",
      "validation.nameRequired",
    ],
    [
      behaviorConcernSchema,
      { concern: "", severity: "mild" },
      "concern",
      "validation.concernRequired",
    ],
    [trainingGoalSchema, { goal: "" }, "goal", "validation.goalRequired"],
    [
      journalMomentCreateSchema,
      { kind: "moment", note: "", occurredAt: "" },
      "note",
      "validation.quickNoteRequired",
    ],
    [
      journalMomentCreateSchema,
      { kind: "moment", note: "note", occurredAt: "" },
      "occurredAt",
      "validation.dateRequired",
    ],
    [
      journalEntryUpdateSchema,
      { kind: "moment", trend: "better" },
      "trend",
      "validation.dailyCheckInTrendOnly",
    ],
    [profileUpdateSchema, { name: "" }, "name", "validation.nameRequired"],
    [trainingSkillSchema, { name: "", confidence: 1 }, "name", "validation.skillNameRequired"],
    [practiceSessionSchema, { occurredAt: "" }, "occurredAt", "validation.dateRequired"],
    [trainerInputSchema, { name: "", city: "x", state: "x" }, "name", "validation.nameRequired"],
    [trainerInputSchema, { name: "x", city: "", state: "x" }, "city", "validation.cityRequired"],
    [trainerInputSchema, { name: "x", city: "x", state: "" }, "state", "validation.stateRequired"],
    [
      trainerInputSchema,
      { name: "x", city: "x", state: "x", website: "ftp://example.com" },
      "website",
      "validation.httpUrlRequired",
    ],
    [
      trainerInputSchema,
      { name: "x", city: "x", state: "x", email: "bad" },
      "email",
      "validation.emailInvalid",
    ],
  ] as const)("emits %s as a stable code", (schema, input, path, expected) => {
    expect(issueMessage(schema, input, path)).toBe(expected);
  });
});
