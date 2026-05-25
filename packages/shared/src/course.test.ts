import { describe, expect, it } from "vitest";
import { courseInputSchema } from "./course";

const base = {
  organizationName: "Seattle Humane Dog Training Center",
  city: "Bellevue",
  state: "WA",
  name: "Puppy Manners 1",
  format: "group",
  ageGroup: "puppy",
};

describe("courseInputSchema", () => {
  it("accepts a valid course", () => {
    expect(courseInputSchema.safeParse(base).success).toBe(true);
  });
  it("defaults skillsTaught to [] and isOnline to false", () => {
    const r = courseInputSchema.parse(base);
    expect(r.skillsTaught).toEqual([]);
    expect(r.isOnline).toBe(false);
  });
  it("rejects missing organizationName", () => {
    const { organizationName, ...rest } = base;
    expect(courseInputSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects missing name", () => {
    const { name, ...rest } = base;
    expect(courseInputSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects a bad format enum", () => {
    expect(courseInputSchema.safeParse({ ...base, format: "lecture" }).success).toBe(false);
  });
  it("rejects a bad ageGroup enum", () => {
    expect(courseInputSchema.safeParse({ ...base, ageGroup: "senior" }).success).toBe(false);
  });
  it("rejects negative durationWeeks", () => {
    expect(courseInputSchema.safeParse({ ...base, durationWeeks: -1 }).success).toBe(false);
  });
  it("accepts optional fields incl. skillsTaught + coursePageUrl", () => {
    expect(
      courseInputSchema.safeParse({
        ...base,
        description: "A 6-week class.",
        ageRange: "15-20 weeks",
        durationWeeks: 6,
        sessionMinutes: 60,
        prerequisites: "Dog Training Basics",
        skillsTaught: ["polite greetings", "basic skills"],
        isOnline: true,
        coursePageUrl: "https://example.com/course",
      }).success,
    ).toBe(true);
  });
});
