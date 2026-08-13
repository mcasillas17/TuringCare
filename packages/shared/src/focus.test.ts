import { describe, expect, it } from "vitest";
import {
  focusAddSchema,
  focusRemoveQuerySchema,
  focusWeekQuerySchema,
  weekKeySchema,
} from "./focus";

const SKILL_ID = "5f3f0b7a-6d1a-4f1e-9a3c-2f5d9d8f6b21";
const MONDAY = "2026-08-10";
const TUESDAY = "2026-08-11";

describe("weekKeySchema", () => {
  it("accepts a Monday date key", () => {
    expect(weekKeySchema.parse(MONDAY)).toBe(MONDAY);
  });

  it("rejects a non-Monday, a malformed key and an impossible date", () => {
    expect(weekKeySchema.safeParse(TUESDAY).success).toBe(false);
    expect(weekKeySchema.safeParse("2026-8-10").success).toBe(false);
    expect(weekKeySchema.safeParse("2026-13-45").success).toBe(false);
  });
});

describe("focusAddSchema", () => {
  it("requires a skill id and a week key", () => {
    expect(focusAddSchema.parse({ skillId: SKILL_ID, weekKey: MONDAY }).weekKey).toBe(MONDAY);
    expect(focusAddSchema.safeParse({ skillId: SKILL_ID }).success).toBe(false);
  });
});

describe("focusWeekQuerySchema", () => {
  it("requires the local week key and browser timezone offset", () => {
    const parsed = focusWeekQuerySchema.parse({
      weekKey: MONDAY,
      timezoneOffsetMinutes: "420",
      weekEndTimezoneOffsetMinutes: "420",
    });
    expect(parsed.weekKey).toBe(MONDAY);
    expect(parsed.timezoneOffsetMinutes).toBe(420);
    expect(parsed.weekEndTimezoneOffsetMinutes).toBe(420);
    expect(
      focusWeekQuerySchema.safeParse({
        weekKey: MONDAY,
        timezoneOffsetMinutes: 900,
        weekEndTimezoneOffsetMinutes: 420,
      }).success,
    ).toBe(false);
  });
});

describe("focusRemoveQuerySchema", () => {
  it("requires the week key", () => {
    expect(focusRemoveQuerySchema.parse({ weekKey: MONDAY }).weekKey).toBe(MONDAY);
    expect(focusRemoveQuerySchema.safeParse({}).success).toBe(false);
  });
});
