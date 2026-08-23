import { isValidationMessageCode } from "@turingcare/shared";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app";
import { type TestUser, createTestUser } from "./test-helpers";

type ValidationIssue = {
  message: string;
  path: Array<string | number>;
};

async function validationIssues(response: Response): Promise<ValidationIssue[]> {
  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    success?: boolean;
    error?: { issues?: ValidationIssue[] };
  };
  expect(body.success).toBe(false);
  expect(body.error?.issues?.length).toBeGreaterThan(0);
  return body.error?.issues ?? [];
}

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "complete",
  spayedNeutered: true,
};

describe("stable API validation contract", () => {
  const users: TestUser[] = [];

  afterEach(async () => {
    for (let user = users.pop(); user; user = users.pop()) await user.cleanup();
  });

  it("preserves explicit validation codes", async () => {
    const issues = await validationIssues(
      await app.request("/api/validate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-TuringCare-Locale": "es" },
        body: JSON.stringify({ name: "", email: "valid@example.com", password: "password-123" }),
      }),
    );

    expect(issues[0]?.message).toBe("validation.nameRequired");
  });

  it.each(["en", "es"] as const)(
    "normalizes malformed JSON to a stable validation payload under %s",
    async (locale) => {
      const response = await app.request("/api/validate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-TuringCare-Locale": locale },
        body: "{",
      });
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(text).not.toContain("Malformed JSON");
      expect(JSON.parse(text)).toEqual({
        success: false,
        error: {
          issues: [{ code: "custom", path: [], message: "validation.invalid" }],
        },
      });
    },
  );

  it.each([
    [
      "max length",
      async (_user: TestUser, locale: "en" | "es") =>
        app.request("/api/validate/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-TuringCare-Locale": locale },
          body: JSON.stringify({
            name: "x".repeat(101),
            email: "valid@example.com",
            password: "password-123",
          }),
        }),
    ],
    [
      "date",
      async (user: TestUser, locale: "en" | "es") =>
        app.request("/api/dogs", {
          method: "POST",
          headers: { ...user.authHeaders, "X-TuringCare-Locale": locale },
          body: JSON.stringify({ ...validDog, dateOfBirth: "not-a-date" }),
        }),
    ],
    [
      "UUID",
      async (user: TestUser, locale: "en" | "es") =>
        app.request("/api/dogs/not-used/focus", {
          method: "POST",
          headers: { ...user.authHeaders, "X-TuringCare-Locale": locale },
          body: JSON.stringify({ skillId: "not-a-uuid" }),
        }),
    ],
    [
      "numeric type",
      async (user: TestUser, locale: "en" | "es") =>
        app.request("/api/dogs", {
          method: "POST",
          headers: { ...user.authHeaders, "X-TuringCare-Locale": locale },
          body: JSON.stringify({ ...validDog, weightLbs: "heavy" }),
        }),
    ],
    [
      "enum",
      async (_user: TestUser, locale: "en" | "es") =>
        app.request("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-TuringCare-Locale": locale },
          body: JSON.stringify({ name: "private.event", props: {} }),
        }),
    ],
    [
      "strict extra field",
      async (user: TestUser, locale: "en" | "es") =>
        app.request("/api/profile/locale", {
          method: "PATCH",
          headers: { ...user.authHeaders, "X-TuringCare-Locale": locale },
          body: JSON.stringify({ locale: "en", userId: "untrusted" }),
        }),
    ],
  ])(
    "normalizes uncoded %s issues to the same allowlisted code under en and es",
    async (_, request) => {
      const user = await createTestUser();
      users.push(user);

      const english = await validationIssues(await request(user, "en"));
      const spanish = await validationIssues(await request(user, "es"));
      const englishCodes = english.map((issue) => issue.message);
      const spanishCodes = spanish.map((issue) => issue.message);

      expect(englishCodes).toEqual(spanishCodes);
      expect(englishCodes).toEqual(["validation.invalid"]);
      expect(englishCodes.every(isValidationMessageCode)).toBe(true);
    },
  );

  it("returns a stable safety-confirmation code for Spanish guided setup validation", async () => {
    const user = await createTestUser();
    users.push(user);

    const issues = await validationIssues(
      await app.request("/api/guided-setup/action/behavior", {
        method: "POST",
        headers: { ...user.authHeaders, "X-TuringCare-Locale": "es" },
        body: JSON.stringify({
          setupId: "00000000-0000-4000-8000-000000000001",
          concern: "Snapped when approached",
          severity: "severe",
          safetyConfirmed: false,
        }),
      }),
    );

    expect(issues).toEqual([
      {
        code: "custom",
        path: ["safetyConfirmed"],
        message: "validation.safetyConfirmationRequired",
      },
    ]);
  });
});
