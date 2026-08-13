import type { CatalogSkill, EasingStrategy, PracticeDimension } from "@turingcare/shared";
import { findCurriculumSkill } from "../data/training-curriculum";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
type CurriculumLevel = 1 | 2 | 3 | 4 | 5;

export type CurriculumTarget = {
  primary: CurriculumExercise;
  fallback: CurriculumFallback;
  requestedDimensions: PracticeDimension[];
};

export type CurriculumExercise = {
  level: number;
  exercise: string;
  dimension: PracticeDimension;
};

export type CurriculumFallback = {
  level: number;
  exercise: string;
  reducedDimension: PracticeDimension;
  sameLevelEasing: boolean;
  easingStrategy: EasingStrategy | null;
};

export function clampCurriculumLevel(requestedLevel: number): CurriculumLevel {
  if (!Number.isFinite(requestedLevel)) return MIN_LEVEL;

  const bounded = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(requestedLevel)));

  switch (bounded) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return bounded;
    default:
      return MIN_LEVEL;
  }
}

function resolveLevelEasing(skill: CatalogSkill, level: CurriculumLevel) {
  switch (level) {
    case 1:
      return {
        dimension: skill.baseEase.dimension,
        strategy: skill.baseEase.strategy,
      };
    case 2:
      return {
        dimension: skill.levelSteps[0],
        strategy: skill.levelStepStrategies[0],
      };
    case 3:
      return {
        dimension: skill.levelSteps[1],
        strategy: skill.levelStepStrategies[1],
      };
    case 4:
      return {
        dimension: skill.levelSteps[2],
        strategy: skill.levelStepStrategies[2],
      };
    case 5:
      return {
        dimension: skill.levelSteps[3],
        strategy: skill.levelStepStrategies[3],
      };
  }
}

function resolvePrimaryExercise(
  skill: CatalogSkill,
  level: CurriculumLevel,
  dimension: PracticeDimension,
): CurriculumExercise | null {
  const authoredLevel = skill.levels.find((candidate) => candidate.level === level);
  if (!authoredLevel) return null;

  return {
    level: authoredLevel.level,
    exercise: authoredLevel.description,
    dimension,
  };
}

export function resolveCurriculumTarget(
  skillKey: string | null | undefined,
  requestedLevel: number,
): CurriculumTarget | null {
  const skill = findCurriculumSkill(skillKey);
  if (!skill) return null;

  const level = clampCurriculumLevel(requestedLevel);
  const { dimension, strategy } = resolveLevelEasing(skill, level);
  const primary = resolvePrimaryExercise(skill, level, dimension);

  if (!primary) return null;

  const fallback: CurriculumFallback = {
    level: primary.level,
    exercise: primary.exercise,
    reducedDimension: dimension,
    sameLevelEasing: true,
    easingStrategy: strategy,
  };

  return {
    primary,
    fallback,
    requestedDimensions: [...skill.dimensions],
  };
}
