import type { EasingStrategy, PracticeDimension } from "./practice-evidence";

export type CatalogLevel = {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
};

/** Authored, professionally reviewed content: names + five level descriptions. */
export type AuthoredCatalogSkill = {
  key: string;
  name: string;
  description: string;
  levels: CatalogLevel[];
};

export type AuthoredCatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: AuthoredCatalogSkill[];
};

/**
 * Machine-readable progression metadata for one catalog skill.
 * - `dimensions`: the practice-context dimensions worth asking the owner about.
 * - `levelSteps`: the single dimension that changes from level 1→2, 2→3, 3→4
 *   and 4→5. Index 0 is the 1→2 step, so the step *into* level N is
 *   `levelSteps[N - 2]`.
 * - `levelStepStrategies`: the reviewed safe easing direction for undoing each
 *   step while keeping the authored exercise at the same level. Every entry is
 *   required so a fallback changes exactly one declared dimension instead of
 *   swapping to lower-level prose that may change several dimensions.
 * - `baseEase`: the reviewed direction used at level 1. Direction is explicit
 *   because greater distance is
 *   easier for trigger work but harder for recall.
 */
export type SkillDimensionMetadata = {
  dimensions: PracticeDimension[];
  levelSteps: [PracticeDimension, PracticeDimension, PracticeDimension, PracticeDimension];
  levelStepStrategies: [EasingStrategy, EasingStrategy, EasingStrategy, EasingStrategy];
  baseEase: {
    dimension: PracticeDimension;
    strategy: EasingStrategy;
  };
};

export type CatalogSkill = AuthoredCatalogSkill & SkillDimensionMetadata;

export type CatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: CatalogSkill[];
};
