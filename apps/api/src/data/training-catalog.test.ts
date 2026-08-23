import { describe, expect, it } from "vitest";
import { getTrainingCatalog, trainingCatalog } from "./training-catalog";

describe("trainingCatalog", () => {
  const englishCatalog = getTrainingCatalog("en");
  const spanishCatalog = getTrainingCatalog("es");

  it("contains exactly 5 templates", () => {
    expect(englishCatalog).toHaveLength(5);
  });

  it("every template key is unique", () => {
    const keys = englishCatalog.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every skill key is unique across the whole catalog and prefixed by its template key", () => {
    const allSkillKeys: string[] = [];
    for (const template of englishCatalog) {
      for (const skill of template.skills) {
        expect(skill.key.startsWith(`${template.key}.`)).toBe(true);
        allSkillKeys.push(skill.key);
      }
    }
    expect(new Set(allSkillKeys).size).toBe(allSkillKeys.length);
  });

  it("every skill has exactly 5 levels numbered 1..5 in order", () => {
    for (const template of englishCatalog) {
      for (const skill of template.skills) {
        expect(skill.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
      }
    }
  });

  it("every level description is a non-empty string", () => {
    for (const template of englishCatalog) {
      for (const skill of template.skills) {
        for (const level of skill.levels) {
          expect(level.description.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("localizes template, skill, and level display text for Spanish", () => {
    expect(spanishCatalog[0]).toMatchObject({
      key: "basic-manners",
      name: "Modales básicos",
      description: "Conductas fundamentales que todo perro debería conocer",
    });
    expect(spanishCatalog[0]?.skills[0]).toMatchObject({
      key: "basic-manners.sit",
      name: "Sentado",
      description: "El perro se sienta de forma confiable con una señal",
    });
    expect(spanishCatalog[0]?.skills[0]?.levels[0]).toEqual({
      level: 1,
      description: "Se guía hasta sentarse con comida en una habitación tranquila",
    });
  });

  it("keeps Spanish and English structures in exact stable-key parity", () => {
    expect(
      spanishCatalog.map((template) => ({
        key: template.key,
        skills: template.skills.map((skill) => ({
          key: skill.key,
          levels: skill.levels.map((level) => level.level),
        })),
      })),
    ).toEqual(
      englishCatalog.map((template) => ({
        key: template.key,
        skills: template.skills.map((skill) => ({
          key: skill.key,
          levels: skill.levels.map((level) => level.level),
        })),
      })),
    );
  });

  it("returns fresh localized structures so mutations cannot leak between requests", () => {
    const first = getTrainingCatalog("es");
    const template = first[0];
    const skill = template?.skills[0];
    const level = skill?.levels[0];
    expect(template).toBeDefined();
    expect(skill).toBeDefined();
    expect(level).toBeDefined();
    if (!template || !skill || !level) {
      throw new Error(
        "Expected the Spanish catalog fixture to include its first template, skill, and level",
      );
    }
    template.name = "mutated template";
    skill.name = "mutated skill";
    level.description = "mutated level";

    const second = getTrainingCatalog("es");

    expect(second[0]?.name).toBe("Modales básicos");
    expect(second[0]?.skills[0]?.name).toBe("Sentado");
    expect(second[0]?.skills[0]?.levels[0]?.description).toBe(
      "Se guía hasta sentarse con comida en una habitación tranquila",
    );
  });

  it("falls back to English for unsupported locale values", () => {
    expect(getTrainingCatalog("fr" as "en")[0]?.name).toBe("Basic Manners");
  });

  it("keeps the compatibility export as the English catalog", () => {
    expect(trainingCatalog).toEqual(englishCatalog);
  });
});
