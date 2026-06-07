import { describe, expect, it } from "vitest";
import { focusAddSchema, focusWeekQuerySchema } from "./focus";

describe("focusAddSchema", () => {
  it("accepts a uuid skillId", () => {
    const r = focusAddSchema.safeParse({ skillId: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(true);
  });
  it("rejects a non-uuid skillId", () => {
    expect(focusAddSchema.safeParse({ skillId: "nope" }).success).toBe(false);
  });
});

describe("focusWeekQuerySchema", () => {
  it("accepts ISO datetime bounds", () => {
    const r = focusWeekQuerySchema.safeParse({
      weekStart: "2026-06-01T07:00:00.000Z",
      weekEnd: "2026-06-08T07:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a non-datetime weekStart", () => {
    expect(
      focusWeekQuerySchema.safeParse({ weekStart: "2026-06-01", weekEnd: "2026-06-08" }).success,
    ).toBe(false);
  });
});
