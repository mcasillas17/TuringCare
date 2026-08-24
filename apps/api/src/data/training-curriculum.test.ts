import { easingStrategyValues, practiceDimensionValues } from "@turingcare/shared";
import { describe, expect, it } from "vitest";
import { trainingCatalog } from "./training-catalog";
import {
  CURRICULUM_VERSION,
  findCurriculumSkill,
  getTrainingCurriculum,
  skillDimensionMetadata,
  trainingCurriculum,
} from "./training-curriculum";

const allSkillKeys = trainingCatalog.flatMap((template) =>
  template.skills.map((skill) => skill.key),
);

describe("training curriculum metadata", () => {
  it("has a stable version string", () => {
    expect(CURRICULUM_VERSION).toBe("2026-08-11");
  });

  it("covers all 21 catalog skills and nothing else", () => {
    expect(allSkillKeys).toHaveLength(21);
    expect(Object.keys(skillDimensionMetadata).sort()).toEqual([...allSkillKeys].sort());
  });

  it("uses only known dimensions", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      for (const dimension of [...meta.dimensions, ...meta.levelSteps, meta.baseEase.dimension]) {
        expect(practiceDimensionValues, `${key} uses an unknown dimension`).toContain(dimension);
      }
    }
  });

  it("asks about at least two dimensions per skill without duplicates", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      expect(meta.dimensions.length, `${key} needs >= 2 dimensions`).toBeGreaterThanOrEqual(2);
      expect(new Set(meta.dimensions).size, `${key} has duplicate dimensions`).toBe(
        meta.dimensions.length,
      );
    }
  });

  it("declares exactly four level steps drawn from the skill's own dimensions", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      expect(meta.levelSteps, `${key} needs 4 level steps`).toHaveLength(4);
      expect(meta.levelStepStrategies, `${key} needs 4 easing strategies`).toHaveLength(4);
      for (const step of meta.levelSteps) {
        expect(meta.dimensions, `${key} step ${step} is not a requested dimension`).toContain(step);
      }
      for (const strategy of meta.levelStepStrategies) {
        expect(easingStrategyValues, `${key} uses an unknown easing strategy`).toContain(strategy);
      }
      expect(meta.dimensions, `${key} base easing dimension is not requested`).toContain(
        meta.baseEase.dimension,
      );
      expect(easingStrategyValues, `${key} uses an unknown easing strategy`).toContain(
        meta.baseEase.strategy,
      );
    }
  });

  it("never leaves a distance step without an explicit safe direction", () => {
    for (const [key, meta] of Object.entries(skillDimensionMetadata)) {
      meta.levelSteps.forEach((dimension, index) => {
        if (dimension === "distance") {
          expect(
            meta.levelStepStrategies[index],
            `${key} distance step ${index + 1} needs a direction`,
          ).not.toBeNull();
        }
      });
    }
  });

  it("keeps reviewed mappings for semantically ambiguous progressions", () => {
    expect(skillDimensionMetadata["basic-manners.stay"]).toEqual({
      dimensions: ["duration", "distance", "distraction"],
      levelSteps: ["distance", "duration", "distraction", "duration"],
      levelStepStrategies: [
        "decrease_owner_distance",
        "shorten_duration",
        "reduce_distractions",
        "shorten_duration",
      ],
      baseEase: { dimension: "duration", strategy: "shorten_duration" },
    });
    expect(skillDimensionMetadata["puppy-fundamentals.potty-signal"]).toEqual({
      dimensions: ["cue_support", "duration"],
      levelSteps: ["duration", "cue_support", "cue_support", "duration"],
      levelStepStrategies: ["shorten_duration", "add_cue_help", "add_cue_help", "shorten_duration"],
      baseEase: { dimension: "duration", strategy: "shorten_duration" },
    });
    expect(skillDimensionMetadata["puppy-fundamentals.bite-inhibition"]).toEqual({
      dimensions: ["cue_support", "distraction"],
      levelSteps: ["cue_support", "cue_support", "cue_support", "cue_support"],
      levelStepStrategies: ["add_cue_help", "add_cue_help", "add_cue_help", "add_cue_help"],
      baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
    });
  });

  it("merges metadata onto every authored skill and keeps the authored prose", () => {
    expect(trainingCurriculum).toHaveLength(trainingCatalog.length);
    for (const template of trainingCurriculum) {
      for (const skill of template.skills) {
        expect(skill.levels).toHaveLength(5);
        expect(skill.levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
        for (const level of skill.levels) {
          expect(level.description.length).toBeGreaterThan(20);
        }
        expect(skill.dimensions.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("localizes authored prose without changing reviewed progression metadata", () => {
    const english = getTrainingCurriculum("en");
    const spanish = getTrainingCurriculum("es");

    expect(spanish[0]).toMatchObject({
      key: "basic-manners",
      name: "Modales básicos",
    });
    expect(spanish[0]?.skills[0]).toMatchObject({
      key: "basic-manners.sit",
      name: "Sentado",
      dimensions: english[0]?.skills[0]?.dimensions,
      levelSteps: english[0]?.skills[0]?.levelSteps,
      levelStepStrategies: english[0]?.skills[0]?.levelStepStrategies,
      baseEase: english[0]?.skills[0]?.baseEase,
    });
    expect(spanish[0]?.skills[0]?.levels[0]?.description).toBe(
      "Se guía hasta sentarse con comida en una habitación tranquila",
    );
  });

  it("finds a skill by key and returns undefined for unknown keys", () => {
    const sit = findCurriculumSkill("basic-manners.sit");
    expect(sit?.name).toBe("Sit");
    expect(sit?.levelSteps).toHaveLength(4);
    expect(findCurriculumSkill("basic-manners.moonwalk")).toBeUndefined();
    expect(findCurriculumSkill(null)).toBeUndefined();
  });
});
