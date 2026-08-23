import { describe, expect, it } from "vitest";
import { briefGenerateSchema, briefSendSchema } from "./brief";

const idempotencyKey = "95acbb6a-9189-4614-9a6e-c732efcc5d1d";

describe("briefSendSchema", () => {
  it("requires an idempotency key so retries cannot duplicate delivery", () => {
    expect(briefSendSchema.safeParse({ recipient: "sarah@example.com" }).success).toBe(false);
  });

  it("accepts a valid email + optional message", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "sarah@example.com", message: "Hi", idempotencyKey })
        .success,
    ).toBe(true);
  });
  it("accepts message null / undefined / missing", () => {
    expect(briefSendSchema.safeParse({ recipient: "a@b.co", idempotencyKey }).success).toBe(true);
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", message: null, idempotencyKey }).success,
    ).toBe(true);
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", message: undefined, idempotencyKey })
        .success,
    ).toBe(true);
  });
  it("accepts a UUID idempotency key and rejects malformed keys", () => {
    expect(
      briefSendSchema.safeParse({
        recipient: "a@b.co",
        idempotencyKey,
      }).success,
    ).toBe(true);
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", idempotencyKey: "not-a-uuid" }).success,
    ).toBe(false);
  });
  it("rejects invalid email", () => {
    expect(briefSendSchema.safeParse({ recipient: "not-an-email", idempotencyKey }).success).toBe(
      false,
    );
    expect(briefSendSchema.safeParse({ recipient: "", idempotencyKey }).success).toBe(false);
  });
  it("rejects message > 500 chars", () => {
    expect(
      briefSendSchema.safeParse({ recipient: "a@b.co", message: "x".repeat(501), idempotencyKey })
        .success,
    ).toBe(false);
  });
});

describe("briefGenerateSchema", () => {
  it("defaults window to 30d when omitted", () => {
    expect(briefGenerateSchema.parse({})).toEqual({ window: "30d" });
  });

  it("accepts each allowed window", () => {
    for (const w of ["7d", "30d", "90d", "all"] as const) {
      expect(briefGenerateSchema.parse({ window: w }).window).toBe(w);
    }
  });

  it("rejects an unknown window", () => {
    expect(briefGenerateSchema.safeParse({ window: "1y" }).success).toBe(false);
  });
});
