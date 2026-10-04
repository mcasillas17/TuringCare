import { type Locale, type Messages, en, es, isLocale } from "@turingcare/i18n";
import type { AuthoredCatalogTemplate } from "@turingcare/shared";

type TrainingCatalogShape = typeof en.trainingCatalog;
type TrainingCatalogMessages = Messages<TrainingCatalogShape>;
type TemplateMessages = TrainingCatalogShape["templates"];
type TemplateKey = keyof TemplateMessages & string;
type SkillKeyFor<T extends TemplateKey> = keyof TemplateMessages[T]["skills"] & string;
type TemplateDefinition<T extends TemplateKey> = {
  key: T;
  skills: readonly SkillKeyFor<T>[];
};
type AnyTemplateDefinition = {
  [T in TemplateKey]: TemplateDefinition<T>;
}[TemplateKey];
type CatalogLevelNumber = (typeof catalogLevelNumbers)[number];
type CatalogLevelKey = `level${CatalogLevelNumber}`;
type CatalogSkillMessages = {
  name: string;
  description: string;
  levels: Record<CatalogLevelKey, string>;
};

const templateDefinitions = [
  {
    key: "basic-manners",
    skills: ["sit", "down", "stay", "recall", "loose-leash"],
  },
  {
    key: "puppy-fundamentals",
    skills: ["name-recognition", "potty-signal", "sit", "bite-inhibition", "settle-on-mat"],
  },
  {
    key: "reactivity-work",
    skills: ["threshold-awareness", "look-at-that", "engage-disengage", "settle-in-distractions"],
  },
  {
    key: "separation-comfort",
    skills: ["calm-departures", "self-settle", "stay-alone-duration"],
  },
  {
    key: "recall-reliability",
    skills: ["name-response", "recall-on-cue", "recall-through-distractions", "recall-at-distance"],
  },
] as const satisfies readonly AnyTemplateDefinition[];

const trainingCatalogMessagesByLocale = {
  en: en.trainingCatalog,
  es: es.trainingCatalog,
} satisfies Record<Locale, TrainingCatalogMessages>;

const catalogLevelNumbers = [1, 2, 3, 4, 5] as const;

function resolveTrainingCatalogMessages(locale: Locale | string): TrainingCatalogMessages {
  return trainingCatalogMessagesByLocale[isLocale(locale) ? locale : "en"];
}

function localizeTemplate(
  definition: AnyTemplateDefinition,
  messages: TrainingCatalogMessages,
): AuthoredCatalogTemplate {
  const templateMessages = messages.templates[definition.key];

  return {
    key: definition.key,
    name: templateMessages.name,
    description: templateMessages.description,
    skills: definition.skills.map((skillKey) => {
      const skillMessages = templateMessages.skills[
        skillKey as keyof typeof templateMessages.skills
      ] as CatalogSkillMessages;

      return {
        key: `${definition.key}.${skillKey}`,
        name: skillMessages.name,
        description: skillMessages.description,
        levels: catalogLevelNumbers.map((level) => ({
          level,
          description: skillMessages.levels[`level${level}`],
        })),
      };
    }),
  };
}

export function getTrainingCatalog(locale: Locale | string = "en"): AuthoredCatalogTemplate[] {
  const messages = resolveTrainingCatalogMessages(locale);

  return templateDefinitions.map((definition) => localizeTemplate(definition, messages));
}

export function createTrainingCatalogLabelResolver(locale: Locale | string = "en") {
  const goalNames = new Map<string, string>();
  const skillNames = new Map<string, string>();
  for (const template of getTrainingCatalog(locale)) {
    goalNames.set(template.key, template.name);
    for (const skill of template.skills) skillNames.set(skill.key, skill.name);
  }

  return {
    resolveGoalName: (catalogGoalKey: string | null, storedName: string) =>
      (catalogGoalKey ? goalNames.get(catalogGoalKey) : undefined) ?? storedName,
    resolveSkillName: (catalogSkillKey: string | null, storedName: string) =>
      (catalogSkillKey ? skillNames.get(catalogSkillKey) : undefined) ?? storedName,
  };
}

export const trainingCatalog: AuthoredCatalogTemplate[] = getTrainingCatalog("en");
