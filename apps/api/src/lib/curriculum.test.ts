import { describe, expect, it } from "vitest";
import { trainingCurriculum } from "../data/training-curriculum";
import { MAX_LEVEL, MIN_LEVEL, clampCurriculumLevel, resolveCurriculumTarget } from "./curriculum";

function expectTarget(skillKey: string | null, requestedLevel: number) {
  const target = resolveCurriculumTarget(skillKey, requestedLevel);
  if (!target) {
    throw new Error(`expected curriculum target for ${skillKey ?? "null"} @ ${requestedLevel}`);
  }
  return target;
}

const allSkills = trainingCurriculum.flatMap((template) => template.skills);

describe("clampCurriculumLevel", () => {
  it("clamps 0, 3, 9, and NaN into the supported range", () => {
    expect(clampCurriculumLevel(0)).toBe(MIN_LEVEL);
    expect(clampCurriculumLevel(3)).toBe(3);
    expect(clampCurriculumLevel(9)).toBe(MAX_LEVEL);
    expect(clampCurriculumLevel(Number.NaN)).toBe(MIN_LEVEL);
  });
});

describe("resolveCurriculumTarget", () => {
  it("returns the authored requested-level description", () => {
    const target = expectTarget("basic-manners.recall", 3);

    expect(target.primary.exercise).toBe(
      "Comes when called inside the house with mild distractions",
    );
  });

  it("keeps the easier fallback at the same level using the exact step mapping", () => {
    const target = expectTarget("basic-manners.stay", 4);

    expect(target.primary).toEqual({
      level: 4,
      exercise: "Holds with light distractions (door opening, food on counter)",
      dimension: "distraction",
    });
    expect(target.fallback).toEqual({
      level: 4,
      exercise: "Holds with light distractions (door opening, food on counter)",
      reducedDimension: "distraction",
      sameLevelEasing: true,
      easingStrategy: "reduce_distractions",
    });
    expect(target.fallback.exercise).not.toBe(
      "Holds for 30 seconds with owner moving around the room",
    );
  });

  it("uses the declared base easing at level 1", () => {
    const target = expectTarget("basic-manners.stay", 1);

    expect(target.primary).toEqual({
      level: 1,
      exercise: "Holds a sit or down for 3-5 seconds, owner next to dog",
      dimension: "duration",
    });
    expect(target.fallback).toEqual({
      level: 1,
      exercise: "Holds a sit or down for 3-5 seconds, owner next to dog",
      reducedDimension: "duration",
      sameLevelEasing: true,
      easingStrategy: "shorten_duration",
    });
  });

  it("uses increased trigger distance for reactivity distance easing", () => {
    const target = expectTarget("reactivity-work.look-at-that", 4);

    expect(target.primary.dimension).toBe("distance");
    expect(target.fallback.reducedDimension).toBe("distance");
    expect(target.fallback.easingStrategy).toBe("increase_trigger_distance");
  });

  it("clamps requested levels that fall outside the authored range", () => {
    const low = expectTarget("basic-manners.sit", 0);
    const high = expectTarget("basic-manners.sit", 9);

    expect(low.primary).toEqual({
      level: 1,
      exercise: "Lures into a sit with food in a quiet room",
      dimension: "cue_support",
    });
    expect(high.primary).toEqual({
      level: 5,
      exercise: "Sits on cue across most environments, including outdoors",
      dimension: "environment",
    });
  });

  it("returns null for unknown or missing curriculum skills", () => {
    expect(resolveCurriculumTarget("basic-manners.moonwalk", 3)).toBeNull();
    expect(resolveCurriculumTarget(null, 3)).toBeNull();
  });

  it("resolves all 21 skills across all 5 levels with same-level fallbacks", () => {
    expect(allSkills).toHaveLength(21);

    for (const skill of allSkills) {
      for (const level of skill.levels) {
        const target = expectTarget(skill.key, level.level);
        const stepIndex = level.level - 2;
        const expectedDimension =
          level.level === MIN_LEVEL ? skill.baseEase.dimension : skill.levelSteps[stepIndex];
        const expectedStrategy =
          level.level === MIN_LEVEL
            ? skill.baseEase.strategy
            : skill.levelStepStrategies[stepIndex];

        expect(target.primary).toEqual({
          level: level.level,
          exercise: level.description,
          dimension: expectedDimension,
        });
        expect(target.fallback).toEqual({
          level: level.level,
          exercise: level.description,
          reducedDimension: expectedDimension,
          sameLevelEasing: true,
          easingStrategy: expectedStrategy,
        });
        expect(target.requestedDimensions).toEqual(skill.dimensions);
      }
    }
  });
});
