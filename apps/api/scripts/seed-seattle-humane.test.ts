import { courseInputSchema } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { seattleHumaneCourses } from "./seed-seattle-humane";

describe("seattleHumaneCourses", () => {
  it("has 19 courses", () => {
    expect(seattleHumaneCourses).toHaveLength(19);
  });
  it("every course passes courseInputSchema", () => {
    for (const c of seattleHumaneCourses) {
      expect(courseInputSchema.safeParse(c).success).toBe(true);
    }
  });
});
