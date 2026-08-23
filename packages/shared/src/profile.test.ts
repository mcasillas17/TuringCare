import { describe, expect, it } from "vitest";
import { profileLocaleUpdateSchema, profileUpdateSchema } from "./profile";

describe("profileUpdateSchema", () => {
  it("accepts a non-empty name", () => {
    expect(profileUpdateSchema.safeParse({ name: "Miguel" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(profileUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("profileLocaleUpdateSchema", () => {
  it.each(["en", "es"])("accepts %s as an account locale", (locale) => {
    expect(profileLocaleUpdateSchema.safeParse({ locale }).success).toBe(true);
  });

  it.each([{}, { locale: "" }, { locale: "fr" }])(
    "rejects missing, empty, and unsupported account locales",
    (input) => {
      expect(profileLocaleUpdateSchema.safeParse(input).success).toBe(false);
    },
  );
});
