import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "./profile";

describe("profileUpdateSchema", () => {
  it("accepts a non-empty name", () => {
    expect(profileUpdateSchema.safeParse({ name: "Miguel" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(profileUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
