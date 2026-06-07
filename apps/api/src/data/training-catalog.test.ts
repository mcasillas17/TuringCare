import { describe, expect, it } from "vitest";
import { trainingCatalog } from "./training-catalog";

describe("trainingCatalog", () => {
  it("contains exactly 5 templates", () => {
    expect(trainingCatalog).toHaveLength(5);
  });

  it("every template key is unique", () => {
    const keys = trainingCatalog.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every skill key is unique across the whole catalog and prefixed by its template key", () => {
    const allSkillKeys: string[] = [];
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        expect(skill.key.startsWith(`${template.key}.`)).toBe(true);
        allSkillKeys.push(skill.key);
      }
    }
    expect(new Set(allSkillKeys).size).toBe(allSkillKeys.length);
  });

  it("every skill has exactly 5 levels numbered 1..5 in order", () => {
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        expect(skill.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  it("every level description is a non-empty string", () => {
    for (const template of trainingCatalog) {
      for (const skill of template.skills) {
        for (const level of skill.levels) {
          expect(level.description.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
