import type { CurriculumExercise, CurriculumFallback, PracticeDimension } from "@turingcare/shared";
import { findCurriculumSkill } from "../data/training-curriculum";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export type CurriculumTarget = {
  skillKey: string;
  level: number;
  primary: CurriculumExercise;
  fallback: CurriculumFallback;
  requestedDimensions: PracticeDimension[];
};

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

/**
 * Resolves the reviewed exercise for a level plus exactly one easier variant.
 * The primary is always the authored level description. The fallback is the
 * same authored description plus one professionally reviewed easing clause for
 * the step dimension. It never substitutes lower-level prose, because an
 * authored level change may alter several dimensions at once.
 */
export function resolveCurriculumTarget(
  skillKey: string | null | undefined,
  level: number,
): CurriculumTarget | null {
  const skill = findCurriculumSkill(skillKey);
  if (!skill) return null;

  const target = clampLevel(level);
  const primaryLevel = skill.levels[target - 1];
  if (!primaryLevel) return null;

  const stepIntoTarget = target >= 2 ? skill.levelSteps[target - 2] : undefined;
  const easingIntoTarget = target >= 2 ? skill.levelStepStrategies[target - 2] : undefined;
  const fallback: CurriculumFallback = {
    level: target,
    exercise: primaryLevel.description,
    reducedDimension: stepIntoTarget ?? skill.baseEase.dimension,
    sameLevelEasing: true,
    easingStrategy: easingIntoTarget ?? skill.baseEase.strategy,
  };

  return {
    skillKey: skill.key,
    level: target,
    primary: {
      level: target,
      exercise: primaryLevel.description,
      dimension: stepIntoTarget ?? skill.baseEase.dimension,
    },
    fallback,
    requestedDimensions: skill.dimensions,
  };
}
