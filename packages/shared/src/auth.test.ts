import { describe, expect, it } from "vitest";
import { safeAuthReturnPath, verificationResendSchema, verificationStatusSchema } from "./auth";

it("validates the exact server-authenticated verification state DTO", () => {
  expect(
    verificationStatusSchema.parse({
      status: "verified",
      next: "/my",
      locale: "en",
      requiresSignOut: true,
    }),
  ).toEqual({ status: "verified", next: "/my", locale: "en", requiresSignOut: true });
  for (const status of ["none", "pending", "verified", "invalid", "expired"]) {
    expect(verificationStatusSchema.parse({ status, next: "/my/dogs", locale: "es" })).toEqual({
      status,
      next: "/my/dogs",
      locale: "es",
    });
  }
  for (const body of [
    { status: "success", next: "/my", locale: "en" },
    { status: "verified", next: "https://evil.example", locale: "en" },
    { status: "verified", next: "/my", locale: "fr" },
    { status: "verified", next: "/my", locale: "en", token: "never-public" },
  ])
    expect(verificationStatusSchema.safeParse(body).success).toBe(false);
});

it.each(["none", "pending", "invalid", "expired"])(
  "rejects requiresSignOut for non-verified status %s",
  (status) => {
    expect(
      verificationStatusSchema.safeParse({
        status,
        next: "/my",
        locale: "en",
        requiresSignOut: true,
      }).success,
    ).toBe(false);
  },
);

describe("safeAuthReturnPath", () => {
  it.each(["/", "/my", "/my/dogs/dog-id/brief", "/admin/courses", "/trainers", "/courses/id"])(
    "preserves internal path %s",
    (path) => expect(safeAuthReturnPath(path)).toBe(path),
  );

  it.each([
    undefined,
    null,
    {},
    "https://evil.example/my",
    "//evil.example",
    "/\\evil.example",
    "/my//evil",
    "/my/../login",
    "/my/%2e%2e/login",
    "/my?next=https://evil.example",
    "/my#token",
    "/my\n",
    "/%2f%2fevil.example",
    "/my/%252f%252fevil",
    "/login",
    "/register",
    "/verify-email",
    "/reset-password",
    "/b/bearer-token",
    "/api/auth/sign-out",
    "/my-other",
  ])("rejects unsafe or looping destination %j", (path) => {
    expect(safeAuthReturnPath(path)).toBe("/my");
  });
});

describe("verificationResendSchema", () => {
  it("allows legacy-session requests and bounded anonymous credentials", () => {
    expect(verificationResendSchema.parse({})).toEqual({});
    expect(
      verificationResendSchema.parse({
        email: "owner@example.com",
        password: "test-password",
        returnTo: "/my",
      }),
    ).toEqual({ email: "owner@example.com", password: "test-password", returnTo: "/my" });
  });

  it("bounds credential and redirect input", () => {
    for (const input of [
      { email: "invalid" },
      { password: "x".repeat(129) },
      { returnTo: "x".repeat(2049) },
    ]) {
      expect(verificationResendSchema.safeParse(input).success).toBe(false);
    }
  });
});
