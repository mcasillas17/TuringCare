import type { Locale } from "@turingcare/i18n";
import type { CatalogSkill, CatalogTemplate, SkillDimensionMetadata } from "@turingcare/shared";
import { getTrainingCatalog, type trainingCatalog } from "./training-catalog";

/**
 * Bumped whenever authored level prose or the metadata below changes meaning.
 * Stamped on practice sessions and suggestion audit rows so cohort analysis can
 * separate evidence collected under different curriculum content.
 */
export const CURRICULUM_VERSION = "2026-08-11";

/**
 * For each catalog skill: which practice-context dimensions we ask about,
 * which single dimension each authored level step raises (1→2, 2→3, 3→4, 4→5),
 * and which dimension to ease at level 1 where no lower level exists.
 * Derived by reading the authored level descriptions in ./training-catalog.ts.
 */
export const skillDimensionMetadata: Record<string, SkillDimensionMetadata> = {
  "basic-manners.sit": {
    dimensions: ["cue_support", "environment", "distraction"],
    levelSteps: ["cue_support", "distraction", "environment", "environment"],
    levelStepStrategies: [
      "add_cue_help",
      "reduce_distractions",
      "use_quieter_environment",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "basic-manners.down": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["cue_support", "distraction", "duration", "environment"],
    levelStepStrategies: [
      "add_cue_help",
      "reduce_distractions",
      "shorten_duration",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "basic-manners.stay": {
    dimensions: ["duration", "distance", "distraction"],
    levelSteps: ["distance", "duration", "distraction", "duration"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "shorten_duration",
      "reduce_distractions",
      "shorten_duration",
    ],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "basic-manners.recall": {
    dimensions: ["distance", "environment", "distraction"],
    levelSteps: ["distance", "distraction", "environment", "distraction"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "reduce_distractions",
      "use_quieter_environment",
      "reduce_distractions",
    ],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
  "basic-manners.loose-leash": {
    dimensions: ["environment", "duration", "distraction"],
    levelSteps: ["environment", "distraction", "distraction", "distraction"],
    levelStepStrategies: [
      "use_quieter_environment",
      "reduce_distractions",
      "reduce_distractions",
      "reduce_distractions",
    ],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "puppy-fundamentals.name-recognition": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distance", "distraction", "environment"],
    levelStepStrategies: [
      "reduce_distractions",
      "decrease_owner_distance",
      "reduce_distractions",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "puppy-fundamentals.potty-signal": {
    dimensions: ["cue_support", "duration"],
    levelSteps: ["duration", "cue_support", "cue_support", "duration"],
    levelStepStrategies: ["shorten_duration", "add_cue_help", "add_cue_help", "shorten_duration"],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "puppy-fundamentals.sit": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["cue_support", "distraction", "duration", "distraction"],
    levelStepStrategies: [
      "add_cue_help",
      "reduce_distractions",
      "shorten_duration",
      "reduce_distractions",
    ],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "puppy-fundamentals.bite-inhibition": {
    dimensions: ["cue_support", "distraction"],
    levelSteps: ["cue_support", "cue_support", "cue_support", "cue_support"],
    levelStepStrategies: ["add_cue_help", "add_cue_help", "add_cue_help", "add_cue_help"],
    baseEase: { dimension: "cue_support", strategy: "add_cue_help" },
  },
  "puppy-fundamentals.settle-on-mat": {
    dimensions: ["cue_support", "environment", "duration", "distraction"],
    levelSteps: ["duration", "duration", "distraction", "duration"],
    levelStepStrategies: [
      "shorten_duration",
      "shorten_duration",
      "reduce_distractions",
      "shorten_duration",
    ],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "reactivity-work.threshold-awareness": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distance", "environment", "environment"],
    levelStepStrategies: [
      "reduce_distractions",
      "increase_trigger_distance",
      "use_quieter_environment",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.look-at-that": {
    dimensions: ["cue_support", "environment", "distance", "distraction"],
    levelSteps: ["cue_support", "distraction", "distance", "environment"],
    levelStepStrategies: [
      "add_cue_help",
      "reduce_distractions",
      "increase_trigger_distance",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.engage-disengage": {
    dimensions: ["cue_support", "environment", "distance", "distraction"],
    levelSteps: ["cue_support", "distraction", "distance", "environment"],
    levelStepStrategies: [
      "add_cue_help",
      "reduce_distractions",
      "increase_trigger_distance",
      "use_quieter_environment",
    ],
    baseEase: { dimension: "distance", strategy: "increase_trigger_distance" },
  },
  "reactivity-work.settle-in-distractions": {
    dimensions: ["environment", "distance", "duration", "distraction"],
    levelSteps: ["duration", "distraction", "environment", "duration"],
    levelStepStrategies: [
      "shorten_duration",
      "reduce_distractions",
      "use_quieter_environment",
      "shorten_duration",
    ],
    baseEase: { dimension: "environment", strategy: "use_quieter_environment" },
  },
  "separation-comfort.calm-departures": {
    dimensions: ["environment", "duration", "distraction"],
    levelSteps: ["distraction", "distraction", "duration", "duration"],
    levelStepStrategies: [
      "reduce_distractions",
      "reduce_distractions",
      "shorten_duration",
      "shorten_duration",
    ],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "separation-comfort.self-settle": {
    dimensions: ["environment", "distance", "duration"],
    levelSteps: ["distance", "duration", "duration", "duration"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "shorten_duration",
      "shorten_duration",
      "shorten_duration",
    ],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "separation-comfort.stay-alone-duration": {
    dimensions: ["environment", "duration"],
    levelSteps: ["duration", "duration", "duration", "duration"],
    levelStepStrategies: [
      "shorten_duration",
      "shorten_duration",
      "shorten_duration",
      "shorten_duration",
    ],
    baseEase: { dimension: "duration", strategy: "shorten_duration" },
  },
  "recall-reliability.name-response": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "distraction", "distraction", "distraction"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "reduce_distractions",
      "reduce_distractions",
      "reduce_distractions",
    ],
    baseEase: { dimension: "distraction", strategy: "reduce_distractions" },
  },
  "recall-reliability.recall-on-cue": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "environment", "distance", "distraction"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "use_quieter_environment",
      "decrease_owner_distance",
      "reduce_distractions",
    ],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
  "recall-reliability.recall-through-distractions": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distraction", "distraction", "distraction", "distraction"],
    levelStepStrategies: [
      "reduce_distractions",
      "reduce_distractions",
      "reduce_distractions",
      "reduce_distractions",
    ],
    baseEase: { dimension: "distraction", strategy: "reduce_distractions" },
  },
  "recall-reliability.recall-at-distance": {
    dimensions: ["environment", "distance", "distraction"],
    levelSteps: ["distance", "distance", "distance", "distance"],
    levelStepStrategies: [
      "decrease_owner_distance",
      "decrease_owner_distance",
      "decrease_owner_distance",
      "decrease_owner_distance",
    ],
    baseEase: { dimension: "distance", strategy: "decrease_owner_distance" },
  },
};

type AuthoredSkill = (typeof trainingCatalog)[number]["skills"][number];

function enrichSkill(templateKey: string, skill: AuthoredSkill): CatalogSkill {
  const metadata = skillDimensionMetadata[skill.key];
  if (!metadata) {
    throw new Error(
      `Missing curriculum metadata for catalog skill "${skill.key}" (${templateKey})`,
    );
  }
  return { ...skill, ...metadata };
}

/** The locale-specific authored catalog enriched with language-neutral progression metadata. */
export function getTrainingCurriculum(locale: Locale | string = "en"): CatalogTemplate[] {
  return getTrainingCatalog(locale).map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    skills: template.skills.map((skill) => enrichSkill(template.key, skill)),
  }));
}

/** Compatibility export used by server-side rules, which operate on stable keys. */
export const trainingCurriculum: CatalogTemplate[] = getTrainingCurriculum("en");

const curriculumByKey = new Map<string, CatalogSkill>(
  trainingCurriculum.flatMap((template) => template.skills.map((skill) => [skill.key, skill])),
);

export function findCurriculumSkill(key: string | null | undefined): CatalogSkill | undefined {
  if (!key) return undefined;
  return curriculumByKey.get(key);
}
