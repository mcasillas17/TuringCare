import { describe, expect, it } from "vitest";
import { safeAuthReturnPath, verificationResendSchema } from "./auth";

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
