import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/turingcare",
  BETTER_AUTH_SECRET: "test-only-insecure-secret-0123456789abcdef",
  BETTER_AUTH_URL: "https://api.turingcare.dog",
  FRONTEND_URL: "https://turingcare.dog",
};

describe("readEnv", () => {
  it.each([undefined, "", "   "])(
    "rejects production startup with a missing or blank Resend API key (%j)",
    (RESEND_API_KEY) => {
      expect(() => readEnv({ ...productionEnv, RESEND_API_KEY })).toThrow(/RESEND_API_KEY/);
    },
  );

  it("accepts production startup when transactional email is configured", () => {
    expect(readEnv({ ...productionEnv, RESEND_API_KEY: "re_production_key" })).toMatchObject({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_production_key",
    });
  });
});
