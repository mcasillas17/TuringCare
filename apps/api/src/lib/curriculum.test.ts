import { describe, expect, it } from "vitest";
import { findCurriculumSkill, trainingCurriculum } from "../data/training-curriculum";
import { clampLevel, resolveCurriculumTarget } from "./curriculum";

const SIT = "basic-manners.sit";
const allSkills = trainingCurriculum.flatMap((template) => template.skills);

describe("clampLevel", () => {
  it("keeps levels inside 1-5", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(3)).toBe(3);
    expect(clampLevel(9)).toBe(5);
    expect(clampLevel(Number.NaN)).toBe(1);
  });
});

describe("resolveCurriculumTarget", () => {
  it("returns the exact authored description for the requested sit level", () => {
    const target = resolveCurriculumTarget(SIT, 3);

    expect(target?.skillKey).toBe(SIT);
    expect(target?.level).toBe(3);
    expect(target?.primary.level).toBe(3);
    expect(target?.primary.exercise).toBe("Sits on cue with one mild distraction present");
  });

  it("keeps the authored level and eases the same sit prose by the exact step dimension", () => {
    const skill = findCurriculumSkill(SIT);
    const target = resolveCurriculumTarget(SIT, 3);

    expect(target?.primary.dimension).toBe(skill?.levelSteps[1]);
    expect(target?.fallback.level).toBe(3);
    expect(target?.fallback.exercise).toBe("Sits on cue with one mild distraction present");
    expect(target?.fallback.sameLevelEasing).toBe(true);
    expect(target?.fallback.easingStrategy).toBe(skill?.levelStepStrategies[1]);
    expect(target?.fallback.reducedDimension).toBe(skill?.levelSteps[1]);
  });

  it("uses the reviewed base easing for sit at level 1", () => {
    const skill = findCurriculumSkill(SIT);
    const target = resolveCurriculumTarget(SIT, 1);

    expect(target?.skillKey).toBe(SIT);
    expect(target?.level).toBe(1);
    expect(target?.primary.level).toBe(1);
    expect(target?.primary.dimension).toBe(skill?.baseEase.dimension);
    expect(target?.fallback.level).toBe(1);
    expect(target?.fallback.exercise).toBe("Lures into a sit with food in a quiet room");
    expect(target?.fallback.sameLevelEasing).toBe(true);
    expect(target?.fallback.reducedDimension).toBe(skill?.baseEase.dimension);
    expect(target?.fallback.easingStrategy).toBe("add_cue_help");
  });

  it("uses distance easing with increased trigger distance for level-1 LAT", () => {
    const target = resolveCurriculumTarget("reactivity-work.look-at-that", 1);

    expect(target?.fallback.reducedDimension).toBe("distance");
    expect(target?.fallback.easingStrategy).toBe("increase_trigger_distance");
  });

  it("clamps out-of-range levels instead of throwing", () => {
    expect(resolveCurriculumTarget(SIT, 42)?.primary.level).toBe(5);
    expect(resolveCurriculumTarget(SIT, -1)?.primary.level).toBe(1);
  });

  it("returns null for a skill that is not in the curriculum", () => {
    expect(resolveCurriculumTarget("basic-manners.moonwalk", 2)).toBeNull();
    expect(resolveCurriculumTarget(null, 2)).toBeNull();
  });

  it("resolves all 21 skills across all 5 levels with explicit same-level fallbacks", () => {
    expect(allSkills).toHaveLength(21);

    for (const skill of allSkills) {
      for (const level of [1, 2, 3, 4, 5] as const) {
        const target = resolveCurriculumTarget(skill.key, level);

        expect(target, `${skill.key} level ${level}`).not.toBeNull();
        expect(target?.skillKey).toBe(skill.key);
        expect(target?.level).toBe(level);
        expect(target?.primary.level).toBe(level);
        expect(target?.primary.exercise.length).toBeGreaterThan(20);
        expect(target?.fallback.exercise.length).toBeGreaterThan(20);
        expect(skill.dimensions).toContain(target?.fallback.reducedDimension);
        expect(target?.fallback.level).toBe(level);
        expect(target?.fallback.sameLevelEasing).toBe(true);
        expect(target?.fallback.easingStrategy).toBe(
          level === 1 ? skill.baseEase.strategy : skill.levelStepStrategies[level - 2],
        );
        expect(target?.requestedDimensions).toEqual(skill.dimensions);
      }
    }
  });
});
