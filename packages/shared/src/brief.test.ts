import { describe, expect, it } from "vitest";
import { briefSendSchema } from "./brief";

describe("briefSendSchema", () => {
  it("accepts a valid email + optional message", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "sarah@example.com", message: "Hi" }).success,
    ).toBe(true);
  });
  it("accepts message null / undefined / missing", () => {
    expect(briefSendSchema.safeParse({ recipient: "a@b.co" }).success).toBe(true);
    expect(briefSendSchema.safeParse({ recipient: "a@b.co", message: null }).success).toBe(true);
    expect(briefSendSchema.safeParse({ recipient: "a@b.co", message: undefined }).success).toBe(
      true,
    );
  });
  it("rejects invalid email", () => {
    expect(briefSendSchema.safeParse({ recipient: "not-an-email" }).success).toBe(false);
    expect(briefSendSchema.safeParse({ recipient: "" }).success).toBe(false);
  });
  it("rejects message > 500 chars", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", message: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
